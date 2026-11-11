"""Extract catalog data from an HTML export, or verify a publishable snapshot."""

import argparse
import base64
import binascii
import hashlib
import json
import os
import re
import struct
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


SITE = Path(__file__).resolve().parents[1] / "site"
SITE_FILES = {"index.html", "catalog.css", "telegram.js", "catalog.js", "catalog.json"}
MEDIA_ID = re.compile(r"[a-f0-9]{20}")
PNG_PATH = re.compile(r"media/([a-f0-9]{64})\.png")
MAX_HTML_BYTES = 100 * 1024 * 1024
MAX_PNG_BYTES = 12 * 1024 * 1024


class CatalogReader(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.catalogs = []
        self.in_catalog = False

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("id") == "catalog":
            require(dict(attrs).get("type") == "application/json", "unexpected catalog type")
            self.catalogs.append([])
            self.in_catalog = True

    def handle_data(self, data):
        if self.in_catalog:
            self.catalogs[-1].append(data)

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_catalog = False


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_url(value, *, optional=False):
    require(isinstance(value, str), "missing link")
    if optional and not value:
        return
    require(
        re.match(r"https?://", value) and not re.search(r"[\s\\\x00-\x1f]", value),
        "expected an HTTP(S) link",
    )
    link = urlsplit(value)
    require(link.hostname and link.username is None, "invalid link host")


def check_catalog(data):
    require(isinstance(data, dict), "expected a catalog object")
    for field in ("items", "resources", "authors", "categories"):
        require(isinstance(data.get(field), list) and data[field], f"invalid {field} list")
    require(isinstance(data.get("meta"), dict), "invalid catalog metadata")
    require(isinstance(data.get("media"), dict), "invalid media index")
    require(
        all(isinstance(category, str) and category for category in data["categories"]),
        "invalid category",
    )

    keys, urls, used_media = set(), set(), set()
    for section in ("items", "resources"):
        for entry in data[section]:
            require(isinstance(entry, dict), "invalid catalog entry")
            for field in ("key", "name", "description", "category", "kind", "author"):
                require(isinstance(entry.get(field), str), f"missing entry field {field}")
            check_url(entry.get("url"))
            check_url(entry.get("authorUrl"), optional=True)
            require(entry["key"] and entry["key"] not in keys, "duplicate or empty entry key")
            require(entry["url"] not in urls, "duplicate entry link")
            require(
                section != "items" or entry["category"] in data["categories"],
                "unknown category",
            )
            keys.add(entry["key"])
            urls.add(entry["url"])
            images = entry.get("images")
            require(isinstance(images, list), "invalid entry image list")
            for image in images:
                require(isinstance(image, str) and image in data["media"], "unknown image")
                used_media.add(image)

    for author in data["authors"]:
        require(
            isinstance(author, dict) and isinstance(author.get("name"), str)
            and type(author.get("count")) is int and author["count"] >= 0,
            "invalid author",
        )
        check_url(author.get("url"))

    require(used_media == set(data["media"]), "media index contains unused images")
    for image_id, image in data["media"].items():
        require(MEDIA_ID.fullmatch(image_id) and isinstance(image, dict), "invalid image entry")
        for field in ("width", "height"):
            require(type(image.get(field)) is int and 0 < image[field] <= 8192, "invalid image size")
        require(isinstance(image.get("origin"), str), "invalid image origin")
        require(type(image.get("animated")) is bool, "invalid image animation flag")
        check_url(image.get("source"))
        check_url(image.get("url"))

    expected_counts = {
        "forumCount": len(data["items"]),
        "resourceCount": len(data["resources"]),
        "authorCount": len(data["authors"]),
        "imageCount": len(data["media"]),
        "imageEntryCount": sum(bool(entry["images"]) for entry in data["items"] + data["resources"]),
    }
    for key, count in expected_counts.items():
        require(data["meta"].get(key) == count, f"invalid catalog count: {key}")
    require(isinstance(data["meta"].get("date"), str), "missing snapshot date")


def check_png(raw, image):
    require(45 <= len(raw) <= MAX_PNG_BYTES, "invalid PNG length")
    require(raw[:8] == b"\x89PNG\r\n\x1a\n", "invalid PNG signature")
    require(raw[8:16] == b"\x00\x00\x00\x0dIHDR", "missing PNG header")
    require(struct.unpack_from(">II", raw, 16) == (image["width"], image["height"]), "PNG size mismatch")
    offset, has_data = 8, False
    while offset + 12 <= len(raw):
        size = struct.unpack_from(">I", raw, offset)[0]
        end = offset + 12 + size
        chunk = raw[offset + 4 : offset + 8]
        require(end <= len(raw), "truncated PNG chunk")
        checksum = binascii.crc32(memoryview(raw)[offset + 4 : end - 4])
        require(checksum == struct.unpack_from(">I", raw, end - 4)[0], "corrupt PNG checksum")
        has_data = has_data or chunk == b"IDAT"
        if chunk == b"IEND":
            require(size == 0 and has_data and end == len(raw), "invalid PNG end")
            return
        offset = end
    raise ValueError("missing PNG end")


def write_snapshot(source, site):
    require(source.stat().st_size <= MAX_HTML_BYTES, "HTML is larger than 100 MiB")
    parser = CatalogReader()
    parser.feed(source.read_text(encoding="utf-8-sig"))
    parser.close()
    require(len(parser.catalogs) == 1 and not parser.in_catalog, "expected one complete catalog block")
    data = json.loads("".join(parser.catalogs[0]))
    check_catalog(data)

    media_dir = site / "media"
    require(not media_dir.is_symlink(), "media directory must be local")
    with tempfile.TemporaryDirectory(prefix=".catalog-", dir=site.parent) as folder:
        staging = Path(folder)
        for image in data["media"].values():
            value = image.pop("data", None)
            prefix = "data:image/png;base64,"
            require(isinstance(value, str) and value.startswith(prefix), "expected embedded PNG")
            require(len(value) <= len(prefix) + (MAX_PNG_BYTES + 2) // 3 * 4, "PNG exceeds 12 MiB")
            raw = base64.b64decode(value[len(prefix) :], validate=True)
            check_png(raw, image)
            name = hashlib.sha256(raw).hexdigest() + ".png"
            (staging / name).write_bytes(raw)
            image["path"] = "media/" + name

        catalog = staging / "catalog.json"
        catalog.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        media_dir.mkdir(exist_ok=True)
        names = {Path(image["path"]).name for image in data["media"].values()}
        for name in names:
            target = media_dir / name
            if not target.is_symlink() and target.is_file() and target.read_bytes() == (staging / name).read_bytes():
                continue
            os.replace(staging / name, target)
        os.replace(catalog, site / "catalog.json")
        for file in media_dir.iterdir():
            if file.name not in names and PNG_PATH.fullmatch("media/" + file.name):
                file.unlink()


def verify(site):
    require({path.name for path in site.iterdir()} == SITE_FILES | {"media"}, "unexpected site contents")
    for name in SITE_FILES:
        path = site / name
        require(path.is_file() and not path.is_symlink(), f"missing or linked site file: {name}")
    media_dir = site / "media"
    require(media_dir.is_dir() and not media_dir.is_symlink(), "media directory must be local")

    data = json.loads((site / "catalog.json").read_text(encoding="utf-8"))
    check_catalog(data)
    checked = {}
    for image in data["media"].values():
        path = image.get("path")
        match = PNG_PATH.fullmatch(path) if isinstance(path, str) else None
        require(match and "data" not in image, "invalid image path")
        file = site / path
        size = (image["width"], image["height"])
        if file.name in checked:
            require(checked[file.name] == size, "inconsistent dimensions for duplicate PNG")
            continue
        require(file.is_file() and not file.is_symlink(), f"missing or linked image: {file.name}")
        require(file.stat().st_size <= MAX_PNG_BYTES, "PNG exceeds 12 MiB")
        raw = file.read_bytes()
        require(hashlib.sha256(raw).hexdigest() == match[1], f"image hash mismatch: {file.name}")
        check_png(raw, image)
        checked[file.name] = size
    require({path.name for path in media_dir.iterdir()} == set(checked), "unexpected media files")
    print(
        f"OK: {len(data['items'])} topics, {len(data['authors'])} authors, "
        f"{len(data['resources'])} resources, {len(data['media'])} image records, {len(checked)} PNG files"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html", type=Path, nargs="?", help="new export HTML with an embedded catalog")
    args = parser.parse_args()
    try:
        if args.html:
            write_snapshot(args.html, SITE)
        verify(SITE)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Catalog update failed: {error}\n")


if __name__ == "__main__":
    main()
