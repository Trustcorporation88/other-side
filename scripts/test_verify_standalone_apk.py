import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from verify_standalone_apk import BUNDLE_PATH, verify_apk


class VerifyStandaloneApkTests(unittest.TestCase):
    def make_apk(self, path: Path, bundle: bytes | None) -> None:
        with ZipFile(path, 'w') as apk:
            apk.writestr('assets/app.config', '{}')
            apk.writestr('lib/arm64-v8a/libreactnative.so', b'fixture')
            if bundle is not None:
                apk.writestr(BUNDLE_PATH, bundle)

    def test_rejects_development_apk_without_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'debug.apk'
            self.make_apk(path, None)
            with self.assertRaisesRegex(ValueError, 'Bundle ausente'):
                verify_apk(path)

    def test_rejects_empty_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'empty.apk'
            self.make_apk(path, b'')
            with self.assertRaisesRegex(ValueError, 'Bundle vazio'):
                verify_apk(path)

    def test_accepts_embedded_bundle_and_reports_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'release.apk'
            bundle = b'fixture JavaScript bundle'
            self.make_apk(path, bundle)
            result = verify_apk(path)
            self.assertEqual(result['bundle_bytes'], len(bundle))
            self.assertEqual(result['architectures'], ['arm64-v8a'])
            self.assertEqual(len(result['apk_sha256']), 64)


if __name__ == '__main__':
    unittest.main()
