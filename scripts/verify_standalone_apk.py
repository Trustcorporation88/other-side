#!/usr/bin/env python3
"""Rejeita APKs que precisam do Metro porque não contêm o bundle do app."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import BadZipFile, ZipFile

BUNDLE_PATH = "assets/index.android.bundle"


def verify_apk(path: Path) -> dict:
    with ZipFile(path) as apk:
        if apk.testzip() is not None:
            raise ValueError("APK corrompido")
        if BUNDLE_PATH not in apk.namelist():
            raise ValueError(f"Bundle ausente: {BUNDLE_PATH}. Não entregar este APK.")
        bundle = apk.read(BUNDLE_PATH)
        if not bundle:
            raise ValueError("Bundle vazio. Não entregar este APK.")
        architectures = sorted({name.split('/')[1] for name in apk.namelist()
                                if name.startswith('lib/') and name.endswith('.so')})
        if not architectures:
            raise ValueError("Bibliotecas nativas ausentes")
    return {
        "apk": path.name,
        "bundle": BUNDLE_PATH,
        "bundle_bytes": len(bundle),
        "bundle_sha256": hashlib.sha256(bundle).hexdigest(),
        "apk_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "architectures": architectures,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    try:
        report = verify_apk(args.apk)
    except (ValueError, BadZipFile, OSError) as error:
        parser.exit(1, f"APK_REJEITADO: {error}\n")
    output = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output, encoding='utf-8')
    print(output, end='')


if __name__ == '__main__':
    main()
