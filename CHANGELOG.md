# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.2](https://github.com/SanjayBabuSP/excelts/compare/v6.1.1...v1.6.2) (2026-03-23)


### ⚠ BREAKING CHANGES

* Module structure and entry points have been reorganized. The archive, CSV, and stream submodules are now first-class exports. See MIGRATION.md for details.
* **csv:** Scanner.nextRow() and Scanner.flush() now reuse internal arrays for performance. Copy the arrays if you need to store results: `const fieldsCopy = [...result.fields]`
* **csv:** `normalizeEscapeOption()` now returns `{ enabled, char }` instead of `string` for consistency with `normalizeQuoteOption()`
* **csv:** Duplicate headers are now auto-renamed instead of throwing errors   - e.g., ["A", "B", "A", "A"] → ["A", "B", "A_1", "A_2"]
* **csv:** CSV Worker types renamed for consistency
    - AggregateResultType → AggregateResult
    - BatchQueryResult → QueryResult
    - QueryResult → FilterResult
* **csv:** unified API with parse/stringify/toBuffer and delimiter auto-detection
* **archive:** simplify ZIP entry type system with breaking changes
* **excel:** None - passthrough is opt-in via workbook options
* **excel:** None - passthrough is opt-in via workbook options
* **compression:** Renamed zlib compression functions to match gzip naming convention
* The main package entrypoints no longer re-export the internal stream utility surface. If you were importing stream helpers from the root package, migrate to standard Web Streams (ReadableStream/WritableStream) or pin to an older version.
* **exports:** Browser build no longer exports the exceljs-compatible stream.xlsx namespace. Use top-level WorkbookWriter/WorkbookReader/WorksheetWriter/WorksheetReader exports instead.
* dyDescent is no longer output by default for new worksheets
* **deps:** All external runtime dependencies removed
* **datetime:** dayjs is no longer used internally
* Minimum Node.js version is now 20.0.0. Node.js 18 is no longer supported.
* TypeScript configuration now uses bundler moduleResolution
* **unzip:** extractAll, extractFile, forEachEntry now return Uint8Array instead of Buffer
* None

### Features

* Add release-please for automated releases ([735d7ef](https://github.com/SanjayBabuSP/excelts/commit/735d7efc114a7aa1c1ebbbbae9894ed2a971dc66))
* **archive:** Add browser Worker Pool for off-main-thread compression ([f0da9fc](https://github.com/SanjayBabuSP/excelts/commit/f0da9fc324e2b5b0e4866a87a974095a196e5b01))
* **archive:** Add deleteDirectory() to ZipEditor ([d80a11f](https://github.com/SanjayBabuSP/excelts/commit/d80a11fd87b709fb47bdae7e304b6e11bc9c41d3))
* **archive:** Add full GZIP support for Node.js and browser ([9e125b1](https://github.com/SanjayBabuSP/excelts/commit/9e125b159a57736bc842b888c71f069ec71015e0))
* **archive:** Add full streaming support to ArchiveFile ([487f455](https://github.com/SanjayBabuSP/excelts/commit/487f455faa89e469dac63b7a0a34a818443fff46))
* **archive:** Add HTTP Range support for remote ZIP reading ([2fd74c6](https://github.com/SanjayBabuSP/excelts/commit/2fd74c664d00dd590ad2d6704e19461c81e2cc42))
* **archive:** Add progress + abort operations for zip/unzip ([9557a37](https://github.com/SanjayBabuSP/excelts/commit/9557a37fc7207c074c956e598da232f6aaad8010))
* **archive:** Add TAR archive support with unified API ([e2d1e39](https://github.com/SanjayBabuSP/excelts/commit/e2d1e3950fcdbf7a8981a26eb08eaaa8f512902d))
* **archive:** Add transform function and concurrency option ([9f11f52](https://github.com/SanjayBabuSP/excelts/commit/9f11f523240fa94c11f98a65865d976adedcc3d2))
* **archive:** Add warnings, stream adapters, and IO concurrency ([c6d0bbd](https://github.com/SanjayBabuSP/excelts/commit/c6d0bbd19457a3688349cf3da7b42631d2be1b41))
* **archive:** Add ZIP encryption support (ZipCrypto + AES) ([23ac09b](https://github.com/SanjayBabuSP/excelts/commit/23ac09b99e76e3f016a607d793adcf26078a627a))
* **archive:** Add zip noSort and ZipParser.childCount ([53c4bf7](https://github.com/SanjayBabuSP/excelts/commit/53c4bf7ff202d831e331f4736aea48548cf7dfaf))
* **archive:** Add ZIP64 write support and safe ZIP64 parsing ([ff866e6](https://github.com/SanjayBabuSP/excelts/commit/ff866e699d4164d983cc4e312ec56c0b4a188c62))
* **archive:** Add ZipEditor best-effort preserve mode ([e69497d](https://github.com/SanjayBabuSP/excelts/commit/e69497d962164a923f8750c772f7535707d8d149))
* **archive:** Add ZipFile class for high-level ZIP operations ([008d89b](https://github.com/SanjayBabuSP/excelts/commit/008d89b2fc81ef4851895bd825c39fc095d741ba))
* **archive:** Export binary/encoding utilities for standalone usage ([9d31a75](https://github.com/SanjayBabuSP/excelts/commit/9d31a75f9901438f526abf5e62b7166081ea1016))
* **archive:** Web Streams unzip + true streaming RemoteZipReader ([5fe7051](https://github.com/SanjayBabuSP/excelts/commit/5fe70518553fd24b9433670c6fa103492ac48b54))
* **browser:** Add pure JavaScript DEFLATE fallback for older browsers ([2a9c29c](https://github.com/SanjayBabuSP/excelts/commit/2a9c29cc7020d9834883827142330d136706f07b))
* **browser:** Native browser support with zero config ([ea3620c](https://github.com/SanjayBabuSP/excelts/commit/ea3620cd363d7fa0c2d8c62293e7b222c2687066))
* **column:** Support CellValue types for column headers (fixes [#2740](https://github.com/SanjayBabuSP/excelts/issues/2740)) ([18a6eb6](https://github.com/SanjayBabuSP/excelts/commit/18a6eb617607e14cf968ebe7f9d72f71c387f7ef))
* Complete pivot table implementation with roundtrip support and codebase refactoring ([2801053](https://github.com/SanjayBabuSP/excelts/commit/2801053450c369bfaeb6a14701cb08a01ed156a7))
* **csv:** Add append mode for writeFile ([593deae](https://github.com/SanjayBabuSP/excelts/commit/593deaeae9f7be476a9aeec6ca6d084841fe3bc2))
* **csv:** Add compatibility features and optimizations ([68ef7ec](https://github.com/SanjayBabuSP/excelts/commit/68ef7ec325c2260e70e90d24c4885def1d2fad3a))
* **csv:** Add csv-generate utility for random CSV data generation ([c75d73c](https://github.com/SanjayBabuSP/excelts/commit/c75d73c3c22f2db37db616719633df1d3b632608))
* **csv:** Add dynamicTyping, chunk callback, and beforeFirstChunk options ([919f48b](https://github.com/SanjayBabuSP/excelts/commit/919f48b12b09a61d5d7c292de09a044eda9cda09))
* **csv:** Add escapeFormulae, fastMode options and refactor streaming ([ac12f41](https://github.com/SanjayBabuSP/excelts/commit/ac12f410dd50cdb56cf29b7d75150c49b050884f))
* **csv:** Add field-level quoting control and refactor utilities ([0a82203](https://github.com/SanjayBabuSP/excelts/commit/0a82203ff6b06b18eced85e69f29059fa6b8ca08))
* **csv:** Add info/raw and relaxQuotes options ([521e484](https://github.com/SanjayBabuSP/excelts/commit/521e484565eea202a4839f2f1a30fd0ef0a82b92))
* **csv:** Add maxRowBytes option for DoS protection ([3245b08](https://github.com/SanjayBabuSP/excelts/commit/3245b080d86ffc6a93f4d42c03433768857a49c5))
* **csv:** Add new parsing options and refactor shared utilities ([45a84b0](https://github.com/SanjayBabuSP/excelts/commit/45a84b05bc3cf15db6c9e6ec43d19ed6e3715f17))
* **csv:** Add RowHashArray support for formatting ([0c8d432](https://github.com/SanjayBabuSP/excelts/commit/0c8d432a3b4357e4a1a003f395ffaa82538e2315))
* **csv:** Add TypeTransformMap for type-based formatting ([2c37345](https://github.com/SanjayBabuSP/excelts/commit/2c3734510eeecc44d673291557d78dde3732021e))
* **csv:** Add valueMapperOptions for decimalSeparator ([b93d66e](https://github.com/SanjayBabuSP/excelts/commit/b93d66e5488e4c9833c913c901bb78f9bfb8a1cf))
* **csv:** Add Web Worker pool for browser CSV operations ([e6758e8](https://github.com/SanjayBabuSP/excelts/commit/e6758e8761e211db896f2cecf9037d7e7276d5a3))
* **csv:** Enhance escapeFormulae with additional characters for CSV injection prevention ([124d19a](https://github.com/SanjayBabuSP/excelts/commit/124d19a8623016e1ca58f4d7c4ac4a86de17d636))
* **csv:** Generate bundled browser worker + centralize CSV types ([7761cc3](https://github.com/SanjayBabuSP/excelts/commit/7761cc33beef135bda1ef96cb88503058842cfa6))
* **csv:** Implement native CSV parser with browser support ([9e9ff9c](https://github.com/SanjayBabuSP/excelts/commit/9e9ff9c9e1d9548327a9c6d668f09fb0782d4dda))
* **csv:** Support decimalSeparator option ([418eccf](https://github.com/SanjayBabuSP/excelts/commit/418eccf56d8ce94127b89a913f6194743d7157d1)), closes [#20](https://github.com/SanjayBabuSP/excelts/issues/20)
* **csv:** Unified API with parse/stringify/toBuffer and delimiter auto-detection ([bd9f88e](https://github.com/SanjayBabuSP/excelts/commit/bd9f88e2d1eff8c317dad212f6dda5cfe2ad0fe4))
* Enhance stream API with improved typing and error handling ([53cf027](https://github.com/SanjayBabuSP/excelts/commit/53cf02751febcf6abf9528b7f10227191370619f))
* Enhance Transform and Writable streams for better backpressure handling and error management ([4773dd8](https://github.com/SanjayBabuSP/excelts/commit/4773dd80a4454587666d8341afad4b668498b88c))
* Enhance ZipCrypto security and add CSV error collection ([7a08413](https://github.com/SanjayBabuSP/excelts/commit/7a08413f5c367bac724dfe4138ab37152dfe5c2f))
* **errors:** Add comprehensive error system with typed error classes ([ef73f6c](https://github.com/SanjayBabuSP/excelts/commit/ef73f6c074457703e016e8de035de2fc5659fa13))
* **excel:** Add chart and drawing passthrough preservation ([a4ea35e](https://github.com/SanjayBabuSP/excelts/commit/a4ea35e2ea4297d7e7a06f9dbc83ffd37fd90de4))
* **excel:** Add chart and drawing passthrough preservation ([501d0bd](https://github.com/SanjayBabuSP/excelts/commit/501d0bdf89d980034d634fc82d45a6897803d6cc))
* **excel:** Add legacy Form Control Checkbox support ([e7d8c4e](https://github.com/SanjayBabuSP/excelts/commit/e7d8c4e4b650aba90d83bb9a2a7d6934945e8a7e))
* **excel:** Add Office Online-compatible in-cell checkboxes ([8ac37ef](https://github.com/SanjayBabuSP/excelts/commit/8ac37efb46a5f33e85462ef53bf8c6a6cc38025d))
* Excelts v6 — cross-platform streaming, archive, and CSV ([28d4f5a](https://github.com/SanjayBabuSP/excelts/commit/28d4f5ab129f57977d3d9fe6b0bfa90e6dcce560))
* **exports:** Unify node and browser entrypoints ([c8bc979](https://github.com/SanjayBabuSP/excelts/commit/c8bc979725b97b33eac7c8433fe9a60c593483f3))
* Expose isEncrypted on UnzipEntry in streaming mode ([bd03cf5](https://github.com/SanjayBabuSP/excelts/commit/bd03cf56b48e121629e69b8ee8aeff83f2dfe1ae))
* **fs:** Add useFs() for custom file system injection ([c94413c](https://github.com/SanjayBabuSP/excelts/commit/c94413c700c984f8fbf598e9cc952091ccc9cea1))
* Integrate sheet-utils into native Worksheet/Workbook API ([34148b1](https://github.com/SanjayBabuSP/excelts/commit/34148b1d85d21d2a1d08f428669c6fe3842c2c1a))
* **pivot-table:** Enhance pivot table support with multiple improvements ([ad9f123](https://github.com/SanjayBabuSP/excelts/commit/ad9f123cfe7739438f3bfaf5b96fc70966d68de8))
* **pivot-table:** Implement pivot table read and preserve functionality (Issue [#261](https://github.com/SanjayBabuSP/excelts/issues/261)) ([9883e5c](https://github.com/SanjayBabuSP/excelts/commit/9883e5c6484fe3a15d6d386b22e64fb0cb418839))
* Remove stream utility re-exports ([ea16582](https://github.com/SanjayBabuSP/excelts/commit/ea16582e8434d845ced099ffca80a63c970d3da2))
* **row:** Add getValues and valuesToString helpers ([9dca08f](https://github.com/SanjayBabuSP/excelts/commit/9dca08f1ad30144121719ad65b4eb622eef66226)), closes [#19](https://github.com/SanjayBabuSP/excelts/issues/19)
* **stream:** Add Symbol.hasInstance, static isDisturbed, pause/resume events, _construct/_undestroy, writev, and addListener/removeListener aliases ([8de5efe](https://github.com/SanjayBabuSP/excelts/commit/8de5efe7cbff9c54edd3d8498e77397a40e385d4))
* **stream:** Add WorksheetWriter.addImage support ([#108](https://github.com/SanjayBabuSP/excelts/issues/108)) ([a91d9e1](https://github.com/SanjayBabuSP/excelts/commit/a91d9e11b8304037658b9bbfc169bde497fd2521))
* **stream:** Enhance Duplex and Readable implementations for better compatibility and performance ([60badc1](https://github.com/SanjayBabuSP/excelts/commit/60badc1a147468500341b0a67c5d32c8ed8489b9))
* **stream:** Enhance stream functionality with new tests, utility functions, and improved options handling ([123ffcf](https://github.com/SanjayBabuSP/excelts/commit/123ffcfce0dbbc34b343480d120599fed3fae829))
* **streaming:** Browser streaming support ([381817c](https://github.com/SanjayBabuSP/excelts/commit/381817ce46b7e367542d251a4da06e98fa747810))
* **streaming:** Support Web Streams across environments ([204ba36](https://github.com/SanjayBabuSP/excelts/commit/204ba365f4100e05d5fe668ab71f3550a789f94a))
* **types:** Add proper typing for Row, Cell, and related methods ([3b4a4f1](https://github.com/SanjayBabuSP/excelts/commit/3b4a4f1f8759391c22ce73b602b647c62ed5a969)), closes [#2](https://github.com/SanjayBabuSP/excelts/issues/2)
* **unzip:** Add cross-platform buffer-based ZIP parser ([7621827](https://github.com/SanjayBabuSP/excelts/commit/76218273571f1c28e16803be0af787f180a7a7e4))
* **worksheet:** Add column page breaks support ([ad90492](https://github.com/SanjayBabuSP/excelts/commit/ad90492a29b6b21f618f0533e20c1e505804e6c6))
* **xlsx:** Allow deterministic zip entry timestamps ([d17da6a](https://github.com/SanjayBabuSP/excelts/commit/d17da6a8eea6db0b2c0fff208fcc11c13d71723f))
* **xlsx:** Store data validations as ranges ([09c2a40](https://github.com/SanjayBabuSP/excelts/commit/09c2a4062c2a4daf1b703dfca195fff0f8dc1987))


### Bug Fixes

* Add main, module, and types fields to package.json for legacy moduleResolution compatibility ([3f67511](https://github.com/SanjayBabuSP/excelts/commit/3f67511325b183a0752debaebca223b6cbe99d67)), closes [#69](https://github.com/SanjayBabuSP/excelts/issues/69)
* Add post-publish verification step to CI workflows ([c93c9c4](https://github.com/SanjayBabuSP/excelts/commit/c93c9c4b10600821fd6689533e89fbd06b005f3e))
* **archive:** Keep ZIP parse streaming for large entries ([c88c61c](https://github.com/SanjayBabuSP/excelts/commit/c88c61cc3b3e22b693147303be1e500cd4402a6a))
* **archive:** Stabilize flaky ZipCrypto wrong password test ([75cfc53](https://github.com/SanjayBabuSP/excelts/commit/75cfc53bea7dec8f16d0ceec49b04a526859444e))
* **archive:** Stabilize streaming unzip and browser parsing ([a503090](https://github.com/SanjayBabuSP/excelts/commit/a50309085bceb6986a07d098c57749b4c1476f5a))
* **archive:** Stabilize streaming unzip and browser parsing ([a148bdf](https://github.com/SanjayBabuSP/excelts/commit/a148bdfd7c77af75413a701999db74a6827004ae))
* **browser:** Fix drawing parsing failure in loadFromFiles path ([98c7ee0](https://github.com/SanjayBabuSP/excelts/commit/98c7ee0a91caf82a5f43bce8cdd97970152ef2ec))
* **build:** Copy LICENSE and THIRD_PARTY_NOTICES to dist/iife ([0919d4d](https://github.com/SanjayBabuSP/excelts/commit/0919d4d6313f4b54dd3dfb20d450be287b71830a))
* **build:** Rewrite tsconfig path aliases in dist outputs ([6791d4e](https://github.com/SanjayBabuSP/excelts/commit/6791d4ea91f0296f70a9914d9817fc96cc3e6f53))
* Chai assertion syntax, anchor copy-paste bug, duplicate test, and 8 weak assertions ([4919a36](https://github.com/SanjayBabuSP/excelts/commit/4919a3613317709cfafbcacdce184aafec80008c))
* Change Worksheet.columns return type from Column[] | null to Column[] ([ab3f3fe](https://github.com/SanjayBabuSP/excelts/commit/ab3f3fef022d8f6d081fdc064bf3a1a38a0ef121))
* **ci:** Add npm publish job to release-please workflow ([a84e54e](https://github.com/SanjayBabuSP/excelts/commit/a84e54e2e238e349fe0218af41036d987a8aa089))
* **ci:** Add outputs to release-please for better integration ([cddf12a](https://github.com/SanjayBabuSP/excelts/commit/cddf12ada88a9e172388c24a61699edc409a0619))
* **ci:** Avoid npm preversion hook in canary version bump ([3bcf30f](https://github.com/SanjayBabuSP/excelts/commit/3bcf30f7eb1eed7c8e8e63331d689c2101aa2113))
* **ci:** Remove stale release-as pinning to unblock version bumps ([1da5585](https://github.com/SanjayBabuSP/excelts/commit/1da558575de7a1e79de16f48e07e6bf1b6bf6961))
* Clone images when duplicating rows ([#57](https://github.com/SanjayBabuSP/excelts/issues/57)) ([bd7d949](https://github.com/SanjayBabuSP/excelts/commit/bd7d949694641f2968a94424f14123827c5634c3))
* Consume data descriptor after known-size pump in streaming parser ([f7be681](https://github.com/SanjayBabuSP/excelts/commit/f7be68135e55fc62d82240166fe18f53673d86dd))
* Correct dishonest type tightenings and remove unsafe toJSON generic ([d974843](https://github.com/SanjayBabuSP/excelts/commit/d9748433666b2b0870098fe2900901aa8cde7245))
* Correct PivotTable XML generation for rowItems, colItems, and recordCount ([2e956a6](https://github.com/SanjayBabuSP/excelts/commit/2e956a6e39be34db854f1d7d56cfca2646b98dc6))
* Correct Table headerRowCount parsing per ECMA-376 ([6cc6016](https://github.com/SanjayBabuSP/excelts/commit/6cc60169b2cd6934b28bbff844195a184990af08))
* **csv:** Comprehensive audit fixes across parse, format, stream, and worker modules ([c664dd9](https://github.com/SanjayBabuSP/excelts/commit/c664dd99ad0c6ecd0ea3555b647c01ef1d6542b7))
* **csv:** Make streaming record offsets character-based ([76d2574](https://github.com/SanjayBabuSP/excelts/commit/76d2574ba9ed6d70d81a245f0de7d0f6e35a94c1))
* Decode OOXML _xHHHH_ escapes in table column name attributes ([#94](https://github.com/SanjayBabuSP/excelts/issues/94)) ([bbfe148](https://github.com/SanjayBabuSP/excelts/commit/bbfe1484799d21ed477cdaad3d7d23e4a1404e50))
* Decode OOXML _xHHHH_ escapes with lowercase hex digits ([#94](https://github.com/SanjayBabuSP/excelts/issues/94)) ([9c3163f](https://github.com/SanjayBabuSP/excelts/commit/9c3163fef636f6b600f133fdb1a9f94aa35617cc))
* **docs:** Add Vite polyfill configuration for browser usage ([0b06ae9](https://github.com/SanjayBabuSP/excelts/commit/0b06ae93fa98dfeb04b17a14de1553df8c8ce526))
* **duplex:** Change Transform import to type-only import ([13efb04](https://github.com/SanjayBabuSP/excelts/commit/13efb046b13f551009c3dba4de8fe439510c86ce))
* Empty style object shadowing in _mergeStyle and shared style references in row/cell operations ([7df419d](https://github.com/SanjayBabuSP/excelts/commit/7df419daeac85c743c4ae50c885025c7b69bcee6))
* **excel:** Add default cfvo and color for dataBar conditional formatting ([d7abd28](https://github.com/SanjayBabuSP/excelts/commit/d7abd28db0cc8acd987324c6a3057d39d6a2ce17))
* **excel:** Case-insensitive worksheet name lookup and correct internal hyperlink OOXML output ([2e5f0dc](https://github.com/SanjayBabuSP/excelts/commit/2e5f0dc1641e7aee3af7ae916432d2bb202cd58a))
* **excel:** Hydrate loaded table rows for mutations ([4f97ebb](https://github.com/SanjayBabuSP/excelts/commit/4f97ebb00671c157fac89cdb789fef8727b6deaa))
* **excel:** Improve legacy form checkbox anchors and controls ([7805a16](https://github.com/SanjayBabuSP/excelts/commit/7805a16a85f81eaccf542c6ad093beb5e7d1e73d))
* **excel:** Keep table formulas readable ([3972145](https://github.com/SanjayBabuSP/excelts/commit/3972145fe1eec92a3d0895583e6dc91eb9aea9fe)), closes [#29](https://github.com/SanjayBabuSP/excelts/issues/29)
* **excel:** Make legacy form controls OOXML-valid ([1af59b7](https://github.com/SanjayBabuSP/excelts/commit/1af59b7f0a2305305c4ab9e6a6b9b9975aaa3add))
* **excel:** Make legacy form controls OOXML-valid ([fe7a444](https://github.com/SanjayBabuSP/excelts/commit/fe7a444a3586977089ee6b8ad9b24f13d8830152))
* **excel:** Make table structured refs work ([302e682](https://github.com/SanjayBabuSP/excelts/commit/302e6827bb0a286bddaeeaf7abf563ada77cda08)), closes [#26](https://github.com/SanjayBabuSP/excelts/issues/26)
* **excel:** Make worksheet name lookup case-insensitive to match Excel semantics ([f735884](https://github.com/SanjayBabuSP/excelts/commit/f73588411a102b913d9fdc971124b835b17a69ea))
* Handle empty defined name ranges and missing colon in print area/titles ([74ce4e6](https://github.com/SanjayBabuSP/excelts/commit/74ce4e6a7bc711c334580bc9cb603800c9b07888))
* Handle missing r attribute in row and cell elements ([#2961](https://github.com/SanjayBabuSP/excelts/issues/2961)) ([1fe4709](https://github.com/SanjayBabuSP/excelts/commit/1fe4709b06bc0da9c90cc2366b0780568400f266))
* Handle styleId=0 correctly in reconcile functions ([01a532b](https://github.com/SanjayBabuSP/excelts/commit/01a532bd0185c6b1381e5dc2c7caf9e875fe8e40))
* Handle styleId=0 correctly in reconcile functions ([50e097a](https://github.com/SanjayBabuSP/excelts/commit/50e097a4edf977331ecb30ee7b86ae000016b755))
* Hide internal underscore-prefixed members from public type declarations ([f94d157](https://github.com/SanjayBabuSP/excelts/commit/f94d1579a2c964e4b4d42269e560d3642f1e06cb)), closes [#68](https://github.com/SanjayBabuSP/excelts/issues/68)
* Ignore dynamicFilter nodes in filterColumn parsing ([#2972](https://github.com/SanjayBabuSP/excelts/issues/2972)) ([609fa18](https://github.com/SanjayBabuSP/excelts/commit/609fa1866b0c0c61b3b942eb35d2143239e42280))
* Improve normalizeWritable function to handle Web WritableStream correctly ([f5cf6f5](https://github.com/SanjayBabuSP/excelts/commit/f5cf6f5fd5167004d90d7f12ae9bfb0ddb053c08))
* Improve public API return types and enum types ([d261785](https://github.com/SanjayBabuSP/excelts/commit/d261785d4ade30ad5db953a17286e309a0753193))
* Improve public API return types and enum types ([c8ca73c](https://github.com/SanjayBabuSP/excelts/commit/c8ca73c10da12fbe5c824e502938a4e6ab0e5017))
* Improve XML output to match Excel's minimal format ([379d895](https://github.com/SanjayBabuSP/excelts/commit/379d895a52b33cfa1c3815953d59d4170e3ca7ec))
* IsDateFmt now correctly recognizes date formats with text fallback sections ([#79](https://github.com/SanjayBabuSP/excelts/issues/79)) ([2d5f238](https://github.com/SanjayBabuSP/excelts/commit/2d5f2389a8d7d145b34a92dc6c7ef7231be7beab))
* Make dyDescent optional per ECMA-376 minimum output principle ([76f9c2b](https://github.com/SanjayBabuSP/excelts/commit/76f9c2b7b87d659f254836b8c92c2bfc071be3d6))
* Make generated types NodeNext-safe ([b618378](https://github.com/SanjayBabuSP/excelts/commit/b618378a19871d2175a452cc658fbd8859d50704))
* Merge main fixes, resolve lint errors, and improve code quality ([8a33545](https://github.com/SanjayBabuSP/excelts/commit/8a335459b5acde8e4a8a25b3fcdfb2f382f3228e))
* MergeCells now preserves perimeter borders like Excel ([d9d28d6](https://github.com/SanjayBabuSP/excelts/commit/d9d28d66500b05665fab2399277ba2536b2a7d65))
* Move test fixture to tracked directory for CI ([eede864](https://github.com/SanjayBabuSP/excelts/commit/eede86496574c76315e40a5a3c9ed1998690b5c6))
* **pivot-table:** Correctly link pivot cache data using pivotCaches from workbook.xml (Issue [#1678](https://github.com/SanjayBabuSP/excelts/issues/1678)) ([3bfc50e](https://github.com/SanjayBabuSP/excelts/commit/3bfc50eda13f0454cdd3f5a6d01cc7b988153ccb))
* **pivot-table:** Preserve worksheetSource name attribute for table references ([#45](https://github.com/SanjayBabuSP/excelts/issues/45)) ([ef1722b](https://github.com/SanjayBabuSP/excelts/commit/ef1722b69c3b84a22e4083024958797f9c1b5b6a))
* PivotTable not forming correctly when rows and values fields are equal ([#15](https://github.com/SanjayBabuSP/excelts/issues/15)) ([d3eb98d](https://github.com/SanjayBabuSP/excelts/commit/d3eb98d2e04a54d05ec3895ec6f3ee49d90a520a))
* Post-merge csv parsing + pivot test import ([8f31be3](https://github.com/SanjayBabuSP/excelts/commit/8f31be3b6afd806363d419f3f88365229023a11c))
* Preserve merge information when splicing rows/columns and duplicating rows ([#53](https://github.com/SanjayBabuSP/excelts/issues/53)) ([62bbc16](https://github.com/SanjayBabuSP/excelts/commit/62bbc160cfb76ed6686b4c81620feb4c3fc5c143))
* Preserve merged cell styles when splicing rows/columns ([#55](https://github.com/SanjayBabuSP/excelts/issues/55)) ([668bec7](https://github.com/SanjayBabuSP/excelts/commit/668bec7956818fd6d30b57993d6c74b9b3f213a6))
* Prevent image duplication on read-write round-trips ([#58](https://github.com/SanjayBabuSP/excelts/issues/58)) ([3da3461](https://github.com/SanjayBabuSP/excelts/commit/3da3461c68bd751e2b43527e458e4ee847b5a9b4))
* Prevent memory overflow when loading files with many definedNames ([#2925](https://github.com/SanjayBabuSP/excelts/issues/2925)) ([bd8d041](https://github.com/SanjayBabuSP/excelts/commit/bd8d0415525c92e5d6d9b5a6599d1314b0b383a5))
* Prevent string formula results from being converted to date ([#2970](https://github.com/SanjayBabuSP/excelts/issues/2970)) ([4750f59](https://github.com/SanjayBabuSP/excelts/commit/4750f59c9de6b47f32a5a0ca514bb4181ab8d1a7))
* Prevent unbounded memory growth in StreamBuf when data listeners are attached ([090b2e4](https://github.com/SanjayBabuSP/excelts/commit/090b2e42b659f251f2409cbf7691939f0fb7e9a0))
* Promote to 6.0.0 stable release ([083e0e0](https://github.com/SanjayBabuSP/excelts/commit/083e0e0be35f49ff866223b569e30d8ca288f115))
* Remove redundant no-op string replacement in workbook roundtrip test ([09ee8dc](https://github.com/SanjayBabuSP/excelts/commit/09ee8dc4ea0336be72f0e1c4236548c88e305ddf))
* Rename zip export to archive in package.json ([f5b3efb](https://github.com/SanjayBabuSP/excelts/commit/f5b3efbbe9cc57f2999fe9aff5eab8db6f1d5359))
* Resolve all 19 CodeQL security alerts ([8e7a79a](https://github.com/SanjayBabuSP/excelts/commit/8e7a79a96e220775ecb2e4b7497fc9d761b03be2))
* Resolve CI failures on Node.js 22 and Windows ([83bd891](https://github.com/SanjayBabuSP/excelts/commit/83bd891d4e85d77adfd9bed9f6b2efd222956b38))
* Resolve last 4 CodeQL alerts with inline barriers ([fa727e4](https://github.com/SanjayBabuSP/excelts/commit/fa727e4aa68d4346d42bb420a7f45a2fb35445af))
* Resolve PivotTable XML generation bugs (Issue [#5](https://github.com/SanjayBabuSP/excelts/issues/5)) ([d564470](https://github.com/SanjayBabuSP/excelts/commit/d564470c3989405a5d4783c669727723cfe020e2))
* Resolve remaining 13 CodeQL security alerts ([91e6628](https://github.com/SanjayBabuSP/excelts/commit/91e6628b6f2286abcc3144cd56768705842cb2b7))
* Resolve TypeError when loading workbook with table column child elements ([f4bcbe6](https://github.com/SanjayBabuSP/excelts/commit/f4bcbe63921060984762fb48f2aa07f5446962a7)), closes [#76](https://github.com/SanjayBabuSP/excelts/issues/76)
* Resolve Windows ENOENT when running rolldown via execFileSync ([d804282](https://github.com/SanjayBabuSP/excelts/commit/d804282d60e95521a84716366e5219218b690465))
* Restore package.json and manifest to current released version ([5111e60](https://github.com/SanjayBabuSP/excelts/commit/5111e60d4fd1d7cee301b61e11190c67c66ece00))
* Revert bad release and fix release-please tag format ([79bb0be](https://github.com/SanjayBabuSP/excelts/commit/79bb0be3b2792d4e87efbd43f623c466113d724f))
* Revert unnecessary optional chaining for date1904 property access ([042f6c3](https://github.com/SanjayBabuSP/excelts/commit/042f6c35981208e284c4aeb60f6f2631cb32362b))
* Row height=0 ignored due to falsy-zero checks, add customHeight support ([9c91fdc](https://github.com/SanjayBabuSP/excelts/commit/9c91fdc8e3d2ac4a8dc44ea654a8c8cd2767e0e8)), closes [#82](https://github.com/SanjayBabuSP/excelts/issues/82)
* Sanitize table names to comply with OOXML defined name rules ([#91](https://github.com/SanjayBabuSP/excelts/issues/91)) ([b6f9b0e](https://github.com/SanjayBabuSP/excelts/commit/b6f9b0e7dd46872b066e90c6ece705931f082ffe))
* **security:** Address CodeQL findings ([77dafd9](https://github.com/SanjayBabuSP/excelts/commit/77dafd9c012bf6ca45f6ec245d320c7edc1ab7ed))
* **security:** Address CodeQL security warnings ([e89b618](https://github.com/SanjayBabuSP/excelts/commit/e89b618872e488e9b5c677fae3389610574817db))
* Simplify release-please to only manage versions, keep tag-based npm publish ([f1236e6](https://github.com/SanjayBabuSP/excelts/commit/f1236e6f36e783cf8012ae29f7dd6c79746f9c64))
* Stabilize flaky ZipCrypto checkPassword test ([b54eb15](https://github.com/SanjayBabuSP/excelts/commit/b54eb1544ce9f2e6e8f31c4006306a139e1f0c1d))
* **stream:** Align browser API surface with Node.js and add comprehensive tests ([6693fbb](https://github.com/SanjayBabuSP/excelts/commit/6693fbb6f9ba253aa0df427f2763ffae4c36e391))
* **stream:** Align browser Duplex/Transform end() and asyncDispose with Node.js behavior ([b0aa31f](https://github.com/SanjayBabuSP/excelts/commit/b0aa31fe7b10fcbc9854802d8f11af680da4f6a1))
* **stream:** Align browser edge-case behaviors with Node.js ([d216cb9](https://github.com/SanjayBabuSP/excelts/commit/d216cb9e6c59d21e24158b0d2e8040cd054e7eae))
* **stream:** Align browser pipeline, compose, duplexPair, and Writable with Node.js behavior ([851b37f](https://github.com/SanjayBabuSP/excelts/commit/851b37f4cafba97ac0fa85af6943d0c0b518fc64))
* **stream:** Align browser stream behavior with Node.js and add cross-platform test coverage ([3aaa945](https://github.com/SanjayBabuSP/excelts/commit/3aaa945bb8b42a562beb643f0b10e10db50ad8d0))
* **stream:** Align browser stream behavior with Node.js and harden internals ([e1220cc](https://github.com/SanjayBabuSP/excelts/commit/e1220ccf43515539a63c5343ed7869162195639e))
* **stream:** Align browser stream behavior with Node.js for _read, async iterators, setEncoding, and HWM defaults ([6d4a835](https://github.com/SanjayBabuSP/excelts/commit/6d4a83549936215a33d55867aa9ed3c3f418263a))
* **stream:** Align browser stream behavior with Node.js parity ([34f69c4](https://github.com/SanjayBabuSP/excelts/commit/34f69c4c4f9a4284efa504fbf491a79d1a45e462))
* **stream:** Align browser stream event timing and API behavior with Node.js ([d317bf2](https://github.com/SanjayBabuSP/excelts/commit/d317bf2279002c219813e2d31780c78b0c0a2e9b))
* **stream:** Align browser stream parity with Node.js for double-callback, destroyed writes, and shorthand removal ([5073134](https://github.com/SanjayBabuSP/excelts/commit/5073134d5ec565101a6047b9d3f393958f99bd7f))
* **stream:** Avoid extra args in browser transform ([6ddacdd](https://github.com/SanjayBabuSP/excelts/commit/6ddacddf719aaf784100179dabac26fdd29432bb))
* **stream:** Constant-memory streaming for ZIP and Excel writers ([#88](https://github.com/SanjayBabuSP/excelts/issues/88)) ([532d7bb](https://github.com/SanjayBabuSP/excelts/commit/532d7bb7261893b2d13c54ced27e8db7c85c8a37))
* **stream:** Fix browser finished() arg parsing, Writable end() chunk normalization, and Duplex _undestroy() event forwarding ([7624d09](https://github.com/SanjayBabuSP/excelts/commit/7624d09d7589b3b4f332f619df7d7e27ba8bb530))
* **stream:** Handle browser transform/flush arity safely ([d80b29d](https://github.com/SanjayBabuSP/excelts/commit/d80b29de30d667125b51684cb3d2d0aa23bfe634))
* **stream:** Harden browser compose() for Node.js parity ([7dc16e3](https://github.com/SanjayBabuSP/excelts/commit/7dc16e33721f0d6d69ff0015718396a69cc7267e))
* **streaming:** Add null guard in WorksheetWriter.eachRow() for sparse rows ([b0f3079](https://github.com/SanjayBabuSP/excelts/commit/b0f30795045794de1231ef53bc761232c50201f2))
* **stream:** Make transform arity dispatch CodeQL-friendly ([4ffdd8b](https://github.com/SanjayBabuSP/excelts/commit/4ffdd8b66847e809a31ed0d43f69051793083bb2))
* **stream:** Refactor compose to use constructor options and fix double-event bugs ([2e1b88a](https://github.com/SanjayBabuSP/excelts/commit/2e1b88a97450d4c1a4909825764109a20c938bd8))
* **stream:** Remove unreachable streamError rethrow ([b80904d](https://github.com/SanjayBabuSP/excelts/commit/b80904dee784b6dc0c1ed92f846194bccec0dcc9))
* **stream:** Resolve 12 browser-vs-Node.js behavioral inconsistencies ([388c1c1](https://github.com/SanjayBabuSP/excelts/commit/388c1c10dbc7ec85d3b73306558e43a2bcfaa900))
* **stream:** Support hex/base64/base64url/ascii in browser chunk.toString() ([3c86549](https://github.com/SanjayBabuSP/excelts/commit/3c86549565b9ea7d95ffdab37b723347324693ff))
* **stream:** Unify Node/browser API behavior and strengthen test quality ([121d824](https://github.com/SanjayBabuSP/excelts/commit/121d82460d96e55c79620ea1dcb54b59fb67da38))
* **stream:** Use direct call with known signature to satisfy CodeQL ([ea53170](https://github.com/SanjayBabuSP/excelts/commit/ea531702c0450c6116c26538da17e48f16c2f6a3))
* **stream:** Use proper type assertion for userFlush call ([51d781c](https://github.com/SanjayBabuSP/excelts/commit/51d781ca286c7747789bb066071112dd5012bb80))
* Support encrypted entries in streaming ZIP parse mode ([32a6c33](https://github.com/SanjayBabuSP/excelts/commit/32a6c330b53cf175a0f7ea8ee66e0548e153b89b))
* Support HAN CELL xlsx files with namespace prefixes ([88820eb](https://github.com/SanjayBabuSP/excelts/commit/88820eb94192c2b9a10c7794cf698aaa66254387))
* **test:** Align csv mapper typing ([ab0d509](https://github.com/SanjayBabuSP/excelts/commit/ab0d509c1c1d8b8867a6a4ec1be9f74686f03888))
* **test:** Pin TAR modTime in byte-for-byte consistency test ([c163e49](https://github.com/SanjayBabuSP/excelts/commit/c163e49568ef7ef58c705dc4ce35b88eb59e86e8))
* **tests:** Update transform and flush methods to use rest parameters for better argument handling ([fb8313a](https://github.com/SanjayBabuSP/excelts/commit/fb8313a23734eca39b52f56ce0381f9e8248a97a))
* **types:** Avoid .d.ts specifiers in declarations ([0e5d37f](https://github.com/SanjayBabuSP/excelts/commit/0e5d37f63b650ad15f02d13c9548899023152c95))
* **types:** Restore proper Row typing for eachRow and add JSDoc comments ([45665af](https://github.com/SanjayBabuSP/excelts/commit/45665afc2b080f47729ff3a173065403446c8ea2))
* Unify model field naming, strengthen types, and rewrite importSheet as deep copy ([cb381c7](https://github.com/SanjayBabuSP/excelts/commit/cb381c7acc54d341102f90b1e12b97638a705e69))
* Update image anchor positions when rows or columns are spliced ([#50](https://github.com/SanjayBabuSP/excelts/issues/50)) ([c164bec](https://github.com/SanjayBabuSP/excelts/commit/c164becdf233e1b96e9cff7ece2e8e2e9dc45990))
* Update worksheet fileIndex handling for consistency in ZIP entry paths ([5cda867](https://github.com/SanjayBabuSP/excelts/commit/5cda86708efb9007e86435157687a705019fb046))
* Use optional chaining for date1904 property access in XLSX class ([4e74f80](https://github.com/SanjayBabuSP/excelts/commit/4e74f805b1817a0a917c5fd73d7faf34f791810d))
* Use optional chaining for date1904 property access in XLSX class ([2bfbd90](https://github.com/SanjayBabuSP/excelts/commit/2bfbd90fe175b49400829bec1c001b172f33e189))
* Widen RowValues object type from Record&lt;string, unknown&gt; to Record&lt;string, any&gt; ([9d29be6](https://github.com/SanjayBabuSP/excelts/commit/9d29be6dceecc92f76176316e01212a82d568399))
* WorkbookReader emits wrong worksheet name when workbook.xml is parsed after worksheets ([206e424](https://github.com/SanjayBabuSP/excelts/commit/206e4246201e74998038b07c7ede327ad6596956))
* WorksheetWriter.findCell used wrong property name (address.column → address.col) ([72ee159](https://github.com/SanjayBabuSP/excelts/commit/72ee159541536be85c7f893de3614b1b79f35cb1))
* Write ht="1" for height=0 rows to reliably trigger Excel auto-height ([69728a6](https://github.com/SanjayBabuSP/excelts/commit/69728a6ad6da6cb7bcf7c128dc2a7a75998f9193))
* **xlsx:** Correct worksheet file naming and pivot table linking (fixes [#2315](https://github.com/SanjayBabuSP/excelts/issues/2315)) ([84144cc](https://github.com/SanjayBabuSP/excelts/commit/84144cc99a8143810f7bd08d65305ca0b8e352e1))
* **xlsx:** Preserve metadata attributes during round-trip ([#41](https://github.com/SanjayBabuSP/excelts/issues/41)) ([5f5d54d](https://github.com/SanjayBabuSP/excelts/commit/5f5d54d1825ce5e64bd69ded42a2511c8070f8bf))
* **xlsx:** Preserve metadata attributes during round-trip ([#41](https://github.com/SanjayBabuSP/excelts/issues/41)) ([21d1ef9](https://github.com/SanjayBabuSP/excelts/commit/21d1ef95bd44fef2d2ed0dca153e3cebd4756deb))


### Code Refactoring

* **archive, stream:** Improve compression pipeline, browser stream API parity, and binary utils ([0ed6d28](https://github.com/SanjayBabuSP/excelts/commit/0ed6d28bb9859a2e1d1779cbdb8da3b8d03aa36e))
* **archive:** Align browser/node implementations ([06888ab](https://github.com/SanjayBabuSP/excelts/commit/06888ab139f364104206ebb83b78e142ae8b035a))
* **archive:** Extract shared ZIP output pipeline from ZipArchive and ZipEditor ([8912118](https://github.com/SanjayBabuSP/excelts/commit/89121189df2a31210c6bd430904761bc57cbfc48))
* **archive:** Remove redundant createArchive/createReader public API ([e6c4ff5](https://github.com/SanjayBabuSP/excelts/commit/e6c4ff516c8e898f9819bf1fc43b867cb8cc28df))
* **archive:** Reorganize module structure for cleaner boundaries ([f5c208a](https://github.com/SanjayBabuSP/excelts/commit/f5c208ae0ea4f5aa1b8dee507e60de2c63a8277e))
* **archive:** Reorganize zip/unzip core + add zip edit APIs ([2acf341](https://github.com/SanjayBabuSP/excelts/commit/2acf341555477492930bb19007d742d228a9c203))
* **archive:** Reorganize zip/unzip modules and APIs ([e2300f2](https://github.com/SanjayBabuSP/excelts/commit/e2300f27f876bea508111d8333a09d8cc74d10f1))
* **archive:** Reorganize zip/unzip modules and APIs ([8b5f4c5](https://github.com/SanjayBabuSP/excelts/commit/8b5f4c517d6bad285da7d50e463e70523879213e))
* **archive:** Simplify ZIP entry type system with breaking changes ([ad63dac](https://github.com/SanjayBabuSP/excelts/commit/ad63dac4905837e27d4ab6362d8d9b3c8f55e720))
* **archive:** Unify ArchiveFile for ZIP/TAR and reduce duplication ([9b4c5fa](https://github.com/SanjayBabuSP/excelts/commit/9b4c5fa5a41c529a85e2614c74e9486cdafdd7a3))
* **archive:** Unify browser compression, worker streaming, and source helpers ([38f6f9b](https://github.com/SanjayBabuSP/excelts/commit/38f6f9b55d47053e9ad35ef3f140cbb0a4ec3319))
* **browser:** Extract shared base classes for Node.js and browser builds ([e7c5450](https://github.com/SanjayBabuSP/excelts/commit/e7c545005a212d3dc74801e53801747c36bfe06b))
* **cell:** Drop HyperlinkValueData alias ([abcde5e](https://github.com/SanjayBabuSP/excelts/commit/abcde5e7b5ec68f16b48905062978a4349ee4cbc))
* **compression:** Rename zlib functions for API consistency ([c29c03a](https://github.com/SanjayBabuSP/excelts/commit/c29c03a7a07622ac4eda938121c54d6ab4316020))
* Consolidate ESM specifier check into fix-esm-imports.mjs ([66a7395](https://github.com/SanjayBabuSP/excelts/commit/66a7395118838712955dac210af8550115e13c7e))
* Consolidate pivot-table examples and clean up project config ([24b26d7](https://github.com/SanjayBabuSP/excelts/commit/24b26d74046736ec5c17a796c146553b3c4f973b))
* Convert all .then() chains to async/await in integration tests ([6ba5dcc](https://github.com/SanjayBabuSP/excelts/commit/6ba5dcc11f87f6a4be52a21ba92a0a4781ec8dcc))
* Convert scripts from JS/MJS to TypeScript ([375ff37](https://github.com/SanjayBabuSP/excelts/commit/375ff37356815232872fff87a04fceb0d811272a))
* **core:** Unify cross-platform modules ([3e4d6c4](https://github.com/SanjayBabuSP/excelts/commit/3e4d6c4c6678588c1cab04f2727ce4e0381e7ed6))
* **csv:** Add completeField helper to parseCsv for consistency ([b4845fe](https://github.com/SanjayBabuSP/excelts/commit/b4845fe2dbca19490ba458edb0073ff213738bd4))
* **csv:** Clean up module structure and unify API naming ([e3d4bc0](https://github.com/SanjayBabuSP/excelts/commit/e3d4bc0ecf0c7418c35574d8b01080982bda024d))
* **csv:** Consolidate parse-engine into parse-core and add lazy worker loading ([efbc5eb](https://github.com/SanjayBabuSP/excelts/commit/efbc5eb75043258e02c16b03deb6dbcc83cbf2dd))
* **csv:** Dedupe decimalSeparator number logic ([c3c79fa](https://github.com/SanjayBabuSP/excelts/commit/c3c79fa351b2258eb1f68dd4d2fb646f78004fe0))
* **csv:** Extract detection and row utilities into separate modules ([c3dfa40](https://github.com/SanjayBabuSP/excelts/commit/c3dfa4020897eee1f311520e734dd17a68ecc38a))
* **csv:** Extract makeTrimField helper and align worker behavior ([5448378](https://github.com/SanjayBabuSP/excelts/commit/5448378746b79c6dd07408769511094902dea325))
* **csv:** Modernize CSV module with improved type safety ([a5f922a](https://github.com/SanjayBabuSP/excelts/commit/a5f922adf67323e96788b5472182a66956b02c88))
* **csv:** Rename parseCsvStream to parseCsvRows and improve code organization ([a3834d6](https://github.com/SanjayBabuSP/excelts/commit/a3834d67da1acb1fa0b32402541d4e68e48cbfeb))
* **csv:** Replace strictColumnHandling with columnMismatch API ([9e8a08f](https://github.com/SanjayBabuSP/excelts/commit/9e8a08f922b85a86b241dbdbe7e124e90075ba57))
* **csv:** Restructure module into subdirectories and remove dead code ([603e9ae](https://github.com/SanjayBabuSP/excelts/commit/603e9ae5eb86deb8e27ac131e063a8fb12b677f6))
* **csv:** Simplify public API and merge scanner files ([c93a8b4](https://github.com/SanjayBabuSP/excelts/commit/c93a8b4bd969b33e79f0ac9abb82aae2a9c9803b))
* **csv:** Unify character parsing and improve fastMode CRLF handling ([fa4fb73](https://github.com/SanjayBabuSP/excelts/commit/fa4fb73b3ebb291b570c072b68bd7eac0102daaa))
* **csv:** Unify constants, improve byte counting, support options.transform/validate ([11c0170](https://github.com/SanjayBabuSP/excelts/commit/11c0170dd40f44748fcdacbe3fcd91000a6eb081))
* **deps:** Replace uuid package with native crypto.randomUUID() ([a4c33a1](https://github.com/SanjayBabuSP/excelts/commit/a4c33a17abf6da96392caac57fe2ff33be6161b6))
* **excel:** Move excel sources under modules and update imports ([5cfe9f3](https://github.com/SanjayBabuSP/excelts/commit/5cfe9f350acd5f77abbbe565b335d7a29bdab91d))
* Improve tree-shaking across all modules ([49b2322](https://github.com/SanjayBabuSP/excelts/commit/49b232211005a3ab269a8b0ab11b1e6a07675cbc))
* Modernize excel module types and patterns ([07e3b89](https://github.com/SanjayBabuSP/excelts/commit/07e3b890e107b056bd8f521619b0ceed6b084b38))
* **pivot-table:** Optimize performance and improve type exports ([5063980](https://github.com/SanjayBabuSP/excelts/commit/506398096fcbc4eb7ea13d3ea812118242958e42))
* Remove redundant datetime utilities ([4f2c3c6](https://github.com/SanjayBabuSP/excelts/commit/4f2c3c61f5acd729c52ec01f214ae1a9c942b8f1))
* Remove redundant datetime utilities ([956aecb](https://github.com/SanjayBabuSP/excelts/commit/956aecbc958941e99820c08f8d0c20e8e3e0de31))
* Remove unused type exports ([8822305](https://github.com/SanjayBabuSP/excelts/commit/8822305c2e0c87ccd8976fef9437ae8319e55fbe))
* Restructure entry points and add subpath exports for zip, csv, stream ([1905a4b](https://github.com/SanjayBabuSP/excelts/commit/1905a4bda6497f9e494613051ad3eaf6f3ec2de8))
* **stream,archive:** Dedupe helpers and optimize buffering ([327fd59](https://github.com/SanjayBabuSP/excelts/commit/327fd5967bb1bba4e0bed06cb006ec717961a5a6))
* **stream,archive:** Dedupe helpers and optimize buffering ([1e0a659](https://github.com/SanjayBabuSP/excelts/commit/1e0a659692a56bfa3292000463a24a11c847ea19))
* **stream:** Align stream behavior with Node.js for error handling and event emissions ([4d823a0](https://github.com/SanjayBabuSP/excelts/commit/4d823a0631406e1ed2aa3bddf21ef6aa5cf19de3))
* **stream:** Improve duplexPair function by using a holder object for stream references ([f33f088](https://github.com/SanjayBabuSP/excelts/commit/f33f0888f85d85e2f6feeff6aec2aaf60dfab1dc))
* **stream:** Modularize stream module architecture and deduplicate shared code ([f851804](https://github.com/SanjayBabuSP/excelts/commit/f851804ca3f3deeaa7e58989639c78f328aa6209))
* **stream:** Optimize stream composition and error handling for better performance and compatibility with Node.js ([cad6701](https://github.com/SanjayBabuSP/excelts/commit/cad67014b64acd06951113ce253531291d343a2b))
* **stream:** Tighten browser/web bridge and Node stream helpers ([73e7552](https://github.com/SanjayBabuSP/excelts/commit/73e755227b691dfec0c875332bb5f779221135a6))
* **stream:** Tighten browser/web bridge and Node stream helpers ([b2b57e9](https://github.com/SanjayBabuSP/excelts/commit/b2b57e95a19aa094819d630a5112fe18e02c1780))
* **stream:** Unify cross-platform logic and extract shared utilities ([7cdca1a](https://github.com/SanjayBabuSP/excelts/commit/7cdca1adaeef7187932a39974f8b0a7487eb633f))
* Switch TypeScript moduleResolution from nodenext to bundler ([73c5d94](https://github.com/SanjayBabuSP/excelts/commit/73c5d941ae2cd18c99752e3e22415cbb23353cd5))
* **table:** Use TableStyleProperties indexed type for theme property ([400f6d0](https://github.com/SanjayBabuSP/excelts/commit/400f6d0f162ac49a22ec0bdbcc04295f86ff0414))
* **types:** Improve type safety across Row, Cell, Anchor, Column, Range, Image, Table and stream classes ([13d32d8](https://github.com/SanjayBabuSP/excelts/commit/13d32d8a9fcef213cb0220df0ac256aca9cf95ef))
* **types:** Improve type safety in stream Reader/Writer classes ([4d33ec6](https://github.com/SanjayBabuSP/excelts/commit/4d33ec63d107c0301b38bdb5612d4ea04bebaaae))
* Update AbortError implementation and related tests to use 'cause' instead of 'reason' ([ab21ce9](https://github.com/SanjayBabuSP/excelts/commit/ab21ce918bdda31388b9f30da94c2d256b28d9fc))
* **worksheet:** Relax return types for row methods to improve flexibility ([3eb099f](https://github.com/SanjayBabuSP/excelts/commit/3eb099f0e4847a3a7d35640af143815375132c44))
* **worksheet:** Simplify row method signatures and comments ([c4c1e36](https://github.com/SanjayBabuSP/excelts/commit/c4c1e36924aeb641be28a80250854af89464a024))
* **zip-parser:** Remove unused centralDirSize variable ([a4dd706](https://github.com/SanjayBabuSP/excelts/commit/a4dd7067ba021582df69debddf4f34e78932595e))
* **zip:** Centralize attrs/versionMadeBy, add path normalization + richer timestamps ([b4c8ce5](https://github.com/SanjayBabuSP/excelts/commit/b4c8ce57d1f43923e82fe5b429b418ccc948cea3))
* **zip:** Replace fflate with native ZIP utilities ([b4ca754](https://github.com/SanjayBabuSP/excelts/commit/b4ca75415a0db72583c6ad663c87506966cd9586))


### Performance Improvements

* **archive:** Speed up streaming unzip hot path ([f808a37](https://github.com/SanjayBabuSP/excelts/commit/f808a37255750a26e2db10a95de98461f52b8241))
* **archive:** Speed up streaming unzip hot path ([64acb02](https://github.com/SanjayBabuSP/excelts/commit/64acb02310d7395143467121ddf5d4a9c2781b52))
* **archive:** Speed up ZIP parse & browser (5MB threshold) ([05484d5](https://github.com/SanjayBabuSP/excelts/commit/05484d59e78bd3f0bcacc313234e787ea1acffa0))
* **csv:** Add structural performance optimizations (S1-S5) ([19668c8](https://github.com/SanjayBabuSP/excelts/commit/19668c8fdab1678911a3c1e2e9d52c01d93a9892))
* **csv:** Optimize parsing with pre-compiled regex and shared utilities ([c3ac575](https://github.com/SanjayBabuSP/excelts/commit/c3ac575d97017489abbede32e5ff263057ded5da))
* **csv:** Optimize parsing with unified helpers and reduced allocations ([270b53c](https://github.com/SanjayBabuSP/excelts/commit/270b53c6e9fd8eb214053ece0245717b2a4ea087))
* **csv:** Optimize streaming parser hot path ([50bf1ef](https://github.com/SanjayBabuSP/excelts/commit/50bf1ef27b59eb8994934262c5deb2217b3346af))
* **datetime:** Replace dayjs with high-performance native datetime utilities ([f804811](https://github.com/SanjayBabuSP/excelts/commit/f8048114d5a1dbd043017d688976d14172acb867))
* Move HAN CELL namespace handling from SAX parser to BaseXform ([cc11b20](https://github.com/SanjayBabuSP/excelts/commit/cc11b206bec2e0eabf5bd2164743bca0cc43fc97))
* Optimize parsing of large data validation ranges ([cfea95a](https://github.com/SanjayBabuSP/excelts/commit/cfea95a31708707cf5cfe4306909423505559a50))
* Replace fflate with native zlib for ZIP compression ([f6ff675](https://github.com/SanjayBabuSP/excelts/commit/f6ff6754cab37b82b58c5b3032cb4dbe228d9381)), closes [#2941](https://github.com/SanjayBabuSP/excelts/issues/2941)
* **sax:** Optimize XML SAX parser with lookup tables and fast paths ([4dc99eb](https://github.com/SanjayBabuSP/excelts/commit/4dc99ebd548f669b38f96e76d7db9ed3078210d5))


### Miscellaneous Chores

* **deps:** Remove all runtime dependencies ([15e7b50](https://github.com/SanjayBabuSP/excelts/commit/15e7b501344042bb8240eb5404df0bc21b59202e))
* Drop Node.js 18 support, require Node.js 20+ ([9568b93](https://github.com/SanjayBabuSP/excelts/commit/9568b9354d8fc84a18c03822d2f49e35acd57f3c))
* Release 1.6.2 ([d075b45](https://github.com/SanjayBabuSP/excelts/commit/d075b45009aee8e699f02d9ba4f3926415250946))

## [6.1.1](https://github.com/cjnoname/excelts/compare/v6.1.0...v6.1.1) (2026-03-23)


### Bug Fixes

* **excel:** Case-insensitive worksheet name lookup and correct internal hyperlink OOXML output ([2e5f0dc](https://github.com/cjnoname/excelts/commit/2e5f0dc1641e7aee3af7ae916432d2bb202cd58a))
* **excel:** Make worksheet name lookup case-insensitive to match Excel semantics ([f735884](https://github.com/cjnoname/excelts/commit/f73588411a102b913d9fdc971124b835b17a69ea))

## [6.1.0](https://github.com/cjnoname/excelts/compare/v6.0.0...v6.1.0) (2026-03-16)


### Features

* **stream:** Add WorksheetWriter.addImage support ([#108](https://github.com/cjnoname/excelts/issues/108)) ([a91d9e1](https://github.com/cjnoname/excelts/commit/a91d9e11b8304037658b9bbfc169bde497fd2521))


### Bug Fixes

* **ci:** Remove stale release-as pinning to unblock version bumps ([1da5585](https://github.com/cjnoname/excelts/commit/1da558575de7a1e79de16f48e07e6bf1b6bf6961))
* **test:** Pin TAR modTime in byte-for-byte consistency test ([c163e49](https://github.com/cjnoname/excelts/commit/c163e49568ef7ef58c705dc4ce35b88eb59e86e8))

## [6.0.0](https://github.com/cjnoname/excelts/compare/v6.0.0-beta.10...v6.0.0) (2026-03-16)


### Bug Fixes

* Promote to 6.0.0 stable release ([083e0e0](https://github.com/cjnoname/excelts/commit/083e0e0be35f49ff866223b569e30d8ca288f115))

## [6.0.0-beta.10](https://github.com/cjnoname/excelts/compare/v6.0.0-beta.9...v6.0.0-beta.10) (2026-03-16)


### Bug Fixes

* Widen RowValues object type from Record&lt;string, unknown&gt; to Record&lt;string, any&gt; ([9d29be6](https://github.com/cjnoname/excelts/commit/9d29be6dceecc92f76176316e01212a82d568399))

## [6.0.0-beta.9](https://github.com/cjnoname/excelts/compare/v6.0.0-beta.8...v6.0.0-beta.9) (2026-03-16)


### Bug Fixes

* **ci:** Avoid npm preversion hook in canary version bump ([3bcf30f](https://github.com/cjnoname/excelts/commit/3bcf30f7eb1eed7c8e8e63331d689c2101aa2113))
* Consume data descriptor after known-size pump in streaming parser ([f7be681](https://github.com/cjnoname/excelts/commit/f7be68135e55fc62d82240166fe18f53673d86dd))

## [6.0.0-beta.8](https://github.com/cjnoname/excelts/compare/v6.0.0-beta.7...v6.0.0-beta.8) (2026-03-15)


### Bug Fixes

* Correct dishonest type tightenings and remove unsafe toJSON generic ([d974843](https://github.com/cjnoname/excelts/commit/d9748433666b2b0870098fe2900901aa8cde7245))
* Restore package.json and manifest to current released version ([5111e60](https://github.com/cjnoname/excelts/commit/5111e60d4fd1d7cee301b61e11190c67c66ece00))

## [6.0.0-beta.7](https://github.com/cjnoname/excelts/compare/v6.0.0-beta.6...v6.0.0-beta.7) (2026-03-15)


### Features

* Integrate sheet-utils into native Worksheet/Workbook API ([34148b1](https://github.com/cjnoname/excelts/commit/34148b1d85d21d2a1d08f428669c6fe3842c2c1a))


### Bug Fixes

* Chai assertion syntax, anchor copy-paste bug, duplicate test, and 8 weak assertions ([4919a36](https://github.com/cjnoname/excelts/commit/4919a3613317709cfafbcacdce184aafec80008c))
* Unify model field naming, strengthen types, and rewrite importSheet as deep copy ([cb381c7](https://github.com/cjnoname/excelts/commit/cb381c7acc54d341102f90b1e12b97638a705e69))
* WorkbookReader emits wrong worksheet name when workbook.xml is parsed after worksheets ([206e424](https://github.com/cjnoname/excelts/commit/206e4246201e74998038b07c7ede327ad6596956))
* WorksheetWriter.findCell used wrong property name (address.column → address.col) ([72ee159](https://github.com/cjnoname/excelts/commit/72ee159541536be85c7f893de3614b1b79f35cb1))


### Code Refactoring

* Convert all .then() chains to async/await in integration tests ([6ba5dcc](https://github.com/cjnoname/excelts/commit/6ba5dcc11f87f6a4be52a21ba92a0a4781ec8dcc))
* Modernize excel module types and patterns ([07e3b89](https://github.com/cjnoname/excelts/commit/07e3b890e107b056bd8f521619b0ceed6b084b38))

## [6.0.0-beta.6](https://github.com/cjnoname/excelts/compare/v6.0.0-beta.5...v6.0.0-beta.6) (2026-03-13)


### Bug Fixes

* Revert bad release and fix release-please tag format ([79bb0be](https://github.com/cjnoname/excelts/commit/79bb0be3b2792d4e87efbd43f623c466113d724f))

## [6.0.0-beta.4](https://github.com/cjnoname/excelts/compare/v6.0.0-beta.3...v6.0.0-beta.4) (2026-03-13)


### Features

* **archive:** export binary/encoding utilities for standalone usage ([9d31a75](https://github.com/cjnoname/excelts/commit/9d31a75f9901438f526abf5e62b7166081ea1016))


### Bug Fixes

* resolve all 19 CodeQL security alerts ([8e7a79a](https://github.com/cjnoname/excelts/commit/8e7a79a96e220775ecb2e4b7497fc9d761b03be2))
* resolve last 4 CodeQL alerts with inline barriers ([fa727e4](https://github.com/cjnoname/excelts/commit/fa727e4aa68d4346d42bb420a7f45a2fb35445af))
* resolve remaining 13 CodeQL security alerts ([91e6628](https://github.com/cjnoname/excelts/commit/91e6628b6f2286abcc3144cd56768705842cb2b7))
* resolve Windows ENOENT when running rolldown via execFileSync ([d804282](https://github.com/cjnoname/excelts/commit/d804282d60e95521a84716366e5219218b690465))
* support encrypted entries in streaming ZIP parse mode ([32a6c33](https://github.com/cjnoname/excelts/commit/32a6c330b53cf175a0f7ea8ee66e0548e153b89b))

## [6.0.0-beta.3](https://github.com/cjnoname/excelts/compare/v6.0.0-beta.2...v6.0.0-beta.3) (2026-03-12)


### Bug Fixes

* change Worksheet.columns return type from Column[] | null to Column[] ([ab3f3fe](https://github.com/cjnoname/excelts/commit/ab3f3fef022d8f6d081fdc064bf3a1a38a0ef121))

## [6.0.0-beta.2](https://github.com/cjnoname/excelts/compare/v6.0.0-beta.1...v6.0.0-beta.2) (2026-03-12)


### Bug Fixes

* decode OOXML _xHHHH_ escapes in table column name attributes ([#94](https://github.com/cjnoname/excelts/issues/94)) ([bbfe148](https://github.com/cjnoname/excelts/commit/bbfe1484799d21ed477cdaad3d7d23e4a1404e50))
* stabilize flaky ZipCrypto checkPassword test ([b54eb15](https://github.com/cjnoname/excelts/commit/b54eb1544ce9f2e6e8f31c4006306a139e1f0c1d))

## [6.0.0-beta.1](https://github.com/cjnoname/excelts/compare/v5.1.18...v6.0.0-beta.1) (2026-03-12)


### ⚠ BREAKING CHANGES

* Module structure and entry points have been reorganized. The archive, CSV, and stream submodules are now first-class exports. See MIGRATION.md for details.

### Features

* excelts v6 — cross-platform streaming, archive, and CSV ([28d4f5a](https://github.com/cjnoname/excelts/commit/28d4f5ab129f57977d3d9fe6b0bfa90e6dcce560))
* expose isEncrypted on UnzipEntry in streaming mode ([bd03cf5](https://github.com/cjnoname/excelts/commit/bd03cf56b48e121629e69b8ee8aeff83f2dfe1ae))


### Bug Fixes

* decode OOXML _xHHHH_ escapes with lowercase hex digits ([#94](https://github.com/cjnoname/excelts/issues/94)) ([9c3163f](https://github.com/cjnoname/excelts/commit/9c3163fef636f6b600f133fdb1a9f94aa35617cc))
* merge main fixes, resolve lint errors, and improve code quality ([8a33545](https://github.com/cjnoname/excelts/commit/8a335459b5acde8e4a8a25b3fcdfb2f382f3228e))
* rename zip export to archive in package.json ([f5b3efb](https://github.com/cjnoname/excelts/commit/f5b3efbbe9cc57f2999fe9aff5eab8db6f1d5359))
* resolve CI failures on Node.js 22 and Windows ([83bd891](https://github.com/cjnoname/excelts/commit/83bd891d4e85d77adfd9bed9f6b2efd222956b38))
* **stream:** align browser stream behavior with Node.js parity ([34f69c4](https://github.com/cjnoname/excelts/commit/34f69c4c4f9a4284efa504fbf491a79d1a45e462))
* **stream:** constant-memory streaming for ZIP and Excel writers ([#88](https://github.com/cjnoname/excelts/issues/88)) ([532d7bb](https://github.com/cjnoname/excelts/commit/532d7bb7261893b2d13c54ced27e8db7c85c8a37))

## [5.1.18](https://github.com/cjnoname/excelts/compare/v5.1.17...v5.1.18) (2026-03-10)

### Bug Fixes

- sanitize table names to comply with OOXML defined name rules ([#91](https://github.com/cjnoname/excelts/issues/91)) ([b6f9b0e](https://github.com/cjnoname/excelts/commit/b6f9b0e7dd46872b066e90c6ece705931f082ffe))

## [5.1.17](https://github.com/cjnoname/excelts/compare/v5.1.16...v5.1.17) (2026-03-10)

### Bug Fixes

- prevent unbounded memory growth in StreamBuf when data listeners are attached ([090b2e4](https://github.com/cjnoname/excelts/commit/090b2e42b659f251f2409cbf7691939f0fb7e9a0))

## [5.1.16](https://github.com/cjnoname/excelts/compare/v5.1.15...v5.1.16) (2026-03-09)

### Bug Fixes

- handle empty defined name ranges and missing colon in print area/titles ([74ce4e6](https://github.com/cjnoname/excelts/commit/74ce4e6a7bc711c334580bc9cb603800c9b07888))

## [5.1.15](https://github.com/cjnoname/excelts/compare/v5.1.14...v5.1.15) (2026-03-08)

### Bug Fixes

- write ht="1" for height=0 rows to reliably trigger Excel auto-height ([69728a6](https://github.com/cjnoname/excelts/commit/69728a6ad6da6cb7bcf7c128dc2a7a75998f9193))

## [5.1.14](https://github.com/cjnoname/excelts/compare/v5.1.13...v5.1.14) (2026-03-07)

### Bug Fixes

- row height=0 ignored due to falsy-zero checks, add customHeight support ([9c91fdc](https://github.com/cjnoname/excelts/commit/9c91fdc8e3d2ac4a8dc44ea654a8c8cd2767e0e8)), closes [#82](https://github.com/cjnoname/excelts/issues/82)

## [5.1.13](https://github.com/cjnoname/excelts/compare/v5.1.12...v5.1.13) (2026-03-07)

### Bug Fixes

- add post-publish verification step to CI workflows ([c93c9c4](https://github.com/cjnoname/excelts/commit/c93c9c4b10600821fd6689533e89fbd06b005f3e))

## [5.1.12](https://github.com/cjnoname/excelts/compare/v5.1.11...v5.1.12) (2026-03-06)

### Bug Fixes

- isDateFmt now correctly recognizes date formats with text fallback sections ([#79](https://github.com/cjnoname/excelts/issues/79)) ([2d5f238](https://github.com/cjnoname/excelts/commit/2d5f2389a8d7d145b34a92dc6c7ef7231be7beab))
- mergeCells now preserves perimeter borders like Excel ([d9d28d6](https://github.com/cjnoname/excelts/commit/d9d28d66500b05665fab2399277ba2536b2a7d65))

## [5.1.11](https://github.com/cjnoname/excelts/compare/v5.1.10...v5.1.11) (2026-03-06)

### Bug Fixes

- resolve TypeError when loading workbook with table column child elements ([f4bcbe6](https://github.com/cjnoname/excelts/commit/f4bcbe63921060984762fb48f2aa07f5446962a7)), closes [#76](https://github.com/cjnoname/excelts/issues/76)

## [5.1.10](https://github.com/cjnoname/excelts/compare/v5.1.9...v5.1.10) (2026-03-05)

### Bug Fixes

- empty style object shadowing in \_mergeStyle and shared style references in row/cell operations ([7df419d](https://github.com/cjnoname/excelts/commit/7df419daeac85c743c4ae50c885025c7b69bcee6))

## [5.1.9](https://github.com/cjnoname/excelts/compare/v5.1.8...v5.1.9) (2026-03-02)

### Bug Fixes

- improve normalizeWritable function to handle Web WritableStream correctly ([f5cf6f5](https://github.com/cjnoname/excelts/commit/f5cf6f5fd5167004d90d7f12ae9bfb0ddb053c08))

## [5.1.8](https://github.com/cjnoname/excelts/compare/v5.1.7...v5.1.8) (2026-02-28)

### Bug Fixes

- improve public API return types and enum types ([d261785](https://github.com/cjnoname/excelts/commit/d261785d4ade30ad5db953a17286e309a0753193))

## [5.1.7](https://github.com/cjnoname/excelts/compare/v5.1.6...v5.1.7) (2026-02-28)

### Bug Fixes

- add main, module, and types fields to package.json for legacy moduleResolution compatibility ([3f67511](https://github.com/cjnoname/excelts/commit/3f67511325b183a0752debaebca223b6cbe99d67)), closes [#69](https://github.com/cjnoname/excelts/issues/69)
- hide internal underscore-prefixed members from public type declarations ([f94d157](https://github.com/cjnoname/excelts/commit/f94d1579a2c964e4b4d42269e560d3642f1e06cb)), closes [#68](https://github.com/cjnoname/excelts/issues/68)

## [5.1.6](https://github.com/cjnoname/excelts/compare/v5.1.5...v5.1.6) (2026-02-28)

### Bug Fixes

- revert unnecessary optional chaining for date1904 property access ([042f6c3](https://github.com/cjnoname/excelts/commit/042f6c35981208e284c4aeb60f6f2631cb32362b))

## [5.1.5](https://github.com/cjnoname/excelts/compare/v5.1.4...v5.1.5) (2026-02-27)

### Bug Fixes

- use optional chaining for date1904 property access in XLSX class ([4e74f80](https://github.com/cjnoname/excelts/commit/4e74f805b1817a0a917c5fd73d7faf34f791810d))

## [5.1.4](https://github.com/cjnoname/excelts/compare/v5.1.3...v5.1.4) (2026-02-27)

### Bug Fixes

- update worksheet fileIndex handling for consistency in ZIP entry paths ([5cda867](https://github.com/cjnoname/excelts/commit/5cda86708efb9007e86435157687a705019fb046))

## [5.1.3](https://github.com/cjnoname/excelts/compare/v5.1.2...v5.1.3) (2026-02-11)

### Bug Fixes

- clone images when duplicating rows ([#57](https://github.com/cjnoname/excelts/issues/57)) ([bd7d949](https://github.com/cjnoname/excelts/commit/bd7d949694641f2968a94424f14123827c5634c3))
- prevent image duplication on read-write round-trips ([#58](https://github.com/cjnoname/excelts/issues/58)) ([3da3461](https://github.com/cjnoname/excelts/commit/3da3461c68bd751e2b43527e458e4ee847b5a9b4))

## [5.1.2](https://github.com/cjnoname/excelts/compare/v5.1.1...v5.1.2) (2026-02-10)

### Bug Fixes

- preserve merged cell styles when splicing rows/columns ([#55](https://github.com/cjnoname/excelts/issues/55)) ([668bec7](https://github.com/cjnoname/excelts/commit/668bec7956818fd6d30b57993d6c74b9b3f213a6))

## [5.1.1](https://github.com/cjnoname/excelts/compare/v5.1.0...v5.1.1) (2026-02-09)

### Bug Fixes

- preserve merge information when splicing rows/columns and duplicating rows ([#53](https://github.com/cjnoname/excelts/issues/53)) ([62bbc16](https://github.com/cjnoname/excelts/commit/62bbc160cfb76ed6686b4c81620feb4c3fc5c143))

## [5.1.0](https://github.com/cjnoname/excelts/compare/v5.0.6...v5.1.0) (2026-02-08)

### Features

- complete pivot table implementation with roundtrip support and codebase refactoring ([2801053](https://github.com/cjnoname/excelts/commit/2801053450c369bfaeb6a14701cb08a01ed156a7))

## [5.0.6](https://github.com/cjnoname/excelts/compare/v5.0.5...v5.0.6) (2026-02-06)

### Bug Fixes

- update image anchor positions when rows or columns are spliced ([#50](https://github.com/cjnoname/excelts/issues/50)) ([c164bec](https://github.com/cjnoname/excelts/commit/c164becdf233e1b96e9cff7ece2e8e2e9dc45990))

## [5.0.5](https://github.com/cjnoname/excelts/compare/v5.0.4...v5.0.5) (2026-02-06)

### Bug Fixes

- handle styleId=0 correctly in reconcile functions ([01a532b](https://github.com/cjnoname/excelts/commit/01a532bd0185c6b1381e5dc2c7caf9e875fe8e40))
- handle styleId=0 correctly in reconcile functions ([50e097a](https://github.com/cjnoname/excelts/commit/50e097a4edf977331ecb30ee7b86ae000016b755))
- **streaming:** add null guard in WorksheetWriter.eachRow() for sparse rows ([b0f3079](https://github.com/cjnoname/excelts/commit/b0f30795045794de1231ef53bc761232c50201f2))

## [5.0.4](https://github.com/cjnoname/excelts/compare/v5.0.3...v5.0.4) (2026-01-25)

### Bug Fixes

- **pivot-table:** preserve worksheetSource name attribute for table references ([#45](https://github.com/cjnoname/excelts/issues/45)) ([ef1722b](https://github.com/cjnoname/excelts/commit/ef1722b69c3b84a22e4083024958797f9c1b5b6a))

## [5.0.3](https://github.com/cjnoname/excelts/compare/v5.0.2...v5.0.3) (2026-01-25)

### Bug Fixes

- **excel:** add default cfvo and color for dataBar conditional formatting ([d7abd28](https://github.com/cjnoname/excelts/commit/d7abd28db0cc8acd987324c6a3057d39d6a2ce17))
- remove redundant no-op string replacement in workbook roundtrip test ([09ee8dc](https://github.com/cjnoname/excelts/commit/09ee8dc4ea0336be72f0e1c4236548c88e305ddf))

## [5.0.2](https://github.com/cjnoname/excelts/compare/v5.0.1...v5.0.2) (2026-01-23)

### Bug Fixes

- **browser:** fix drawing parsing failure in loadFromFiles path ([98c7ee0](https://github.com/cjnoname/excelts/commit/98c7ee0a91caf82a5f43bce8cdd97970152ef2ec))

## [5.0.1](https://github.com/cjnoname/excelts/compare/v5.0.0...v5.0.1) (2026-01-23)

### Bug Fixes

- **xlsx:** preserve metadata attributes during round-trip ([#41](https://github.com/cjnoname/excelts/issues/41)) ([5f5d54d](https://github.com/cjnoname/excelts/commit/5f5d54d1825ce5e64bd69ded42a2511c8070f8bf))

## [5.0.0](https://github.com/cjnoname/excelts/compare/v4.2.3...v5.0.0) (2026-01-22)

### ⚠ BREAKING CHANGES

- **excel:** None - passthrough is opt-in via workbook options

### Features

- **excel:** add chart and drawing passthrough preservation ([a4ea35e](https://github.com/cjnoname/excelts/commit/a4ea35e2ea4297d7e7a06f9dbc83ffd37fd90de4))

### Bug Fixes

- **stream:** remove unreachable streamError rethrow ([b80904d](https://github.com/cjnoname/excelts/commit/b80904dee784b6dc0c1ed92f846194bccec0dcc9))

### Performance Improvements

- move HAN CELL namespace handling from SAX parser to BaseXform ([cc11b20](https://github.com/cjnoname/excelts/commit/cc11b206bec2e0eabf5bd2164743bca0cc43fc97))

## [4.2.3](https://github.com/cjnoname/excelts/compare/v4.2.2...v4.2.3) (2026-01-15)

### Bug Fixes

- support HAN CELL xlsx files with namespace prefixes ([88820eb](https://github.com/cjnoname/excelts/commit/88820eb94192c2b9a10c7794cf698aaa66254387))

## [4.2.2](https://github.com/cjnoname/excelts/compare/v4.2.1...v4.2.2) (2026-01-12)

### Bug Fixes

- **archive:** stabilize streaming unzip and browser parsing ([a503090](https://github.com/cjnoname/excelts/commit/a50309085bceb6986a07d098c57749b4c1476f5a))
- **excel:** make legacy form controls OOXML-valid ([fe7a444](https://github.com/cjnoname/excelts/commit/fe7a444a3586977089ee6b8ad9b24f13d8830152))

### Performance Improvements

- **archive:** speed up streaming unzip hot path ([f808a37](https://github.com/cjnoname/excelts/commit/f808a37255750a26e2db10a95de98461f52b8241))

## [4.2.1](https://github.com/cjnoname/excelts/compare/v4.2.0...v4.2.1) (2026-01-10)

### Bug Fixes

- **archive:** keep ZIP parse streaming for large entries ([c88c61c](https://github.com/cjnoname/excelts/commit/c88c61cc3b3e22b693147303be1e500cd4402a6a))
- **build:** copy LICENSE and THIRD_PARTY_NOTICES to dist/iife ([0919d4d](https://github.com/cjnoname/excelts/commit/0919d4d6313f4b54dd3dfb20d450be287b71830a))
- **excel:** improve legacy form checkbox anchors and controls ([7805a16](https://github.com/cjnoname/excelts/commit/7805a16a85f81eaccf542c6ad093beb5e7d1e73d))

## [4.2.0](https://github.com/cjnoname/excelts/compare/v4.1.0...v4.2.0) (2026-01-10)

### Features

- **excel:** add legacy Form Control Checkbox support ([e7d8c4e](https://github.com/cjnoname/excelts/commit/e7d8c4e4b650aba90d83bb9a2a7d6934945e8a7e))

## [4.1.0](https://github.com/cjnoname/excelts/compare/v4.0.4...v4.1.0) (2026-01-10)

### Features

- **excel:** add Office Online-compatible in-cell checkboxes ([8ac37ef](https://github.com/cjnoname/excelts/commit/8ac37efb46a5f33e85462ef53bf8c6a6cc38025d))

### Bug Fixes

- **excel:** hydrate loaded table rows for mutations ([4f97ebb](https://github.com/cjnoname/excelts/commit/4f97ebb00671c157fac89cdb789fef8727b6deaa))

## [4.0.4](https://github.com/cjnoname/excelts/compare/v4.0.3...v4.0.4) (2026-01-06)

### Bug Fixes

- make generated types NodeNext-safe ([b618378](https://github.com/cjnoname/excelts/commit/b618378a19871d2175a452cc658fbd8859d50704))

## [4.0.3](https://github.com/cjnoname/excelts/compare/v4.0.2...v4.0.3) (2026-01-04)

### Bug Fixes

- **excel:** keep table formulas readable ([3972145](https://github.com/cjnoname/excelts/commit/3972145fe1eec92a3d0895583e6dc91eb9aea9fe)), closes [#29](https://github.com/cjnoname/excelts/issues/29)

## [4.0.2](https://github.com/cjnoname/excelts/compare/v4.0.1...v4.0.2) (2026-01-04)

### Bug Fixes

- **excel:** make table structured refs work ([302e682](https://github.com/cjnoname/excelts/commit/302e6827bb0a286bddaeeaf7abf563ada77cda08)), closes [#26](https://github.com/cjnoname/excelts/issues/26)

## [4.0.1](https://github.com/cjnoname/excelts/compare/v4.0.0...v4.0.1) (2026-01-03)

### Bug Fixes

- **types:** avoid .d.ts specifiers in declarations ([0e5d37f](https://github.com/cjnoname/excelts/commit/0e5d37f63b650ad15f02d13c9548899023152c95))

## [4.0.0](https://github.com/cjnoname/excelts/compare/v3.1.0...v4.0.0) (2026-01-02)

### ⚠ BREAKING CHANGES

- The main package entrypoints no longer re-export the internal stream utility surface. If you were importing stream helpers from the root package, migrate to standard Web Streams (ReadableStream/WritableStream) or pin to an older version.
- **exports:** Use top-level WorkbookWriter/WorkbookReader/WorksheetWriter/WorksheetReader exports instead.

### Features

- **csv:** add valueMapperOptions for decimalSeparator ([b93d66e](https://github.com/cjnoname/excelts/commit/b93d66e5488e4c9833c913c901bb78f9bfb8a1cf))
- **exports:** unify node and browser entrypoints ([c8bc979](https://github.com/cjnoname/excelts/commit/c8bc979725b97b33eac7c8433fe9a60c593483f3))
- remove stream utility re-exports ([ea16582](https://github.com/cjnoname/excelts/commit/ea16582e8434d845ced099ffca80a63c970d3da2))
- **streaming:** browser streaming support ([381817c](https://github.com/cjnoname/excelts/commit/381817ce46b7e367542d251a4da06e98fa747810))
- **streaming:** support Web Streams across environments ([204ba36](https://github.com/cjnoname/excelts/commit/204ba365f4100e05d5fe668ab71f3550a789f94a))
- **xlsx:** allow deterministic zip entry timestamps ([d17da6a](https://github.com/cjnoname/excelts/commit/d17da6a8eea6db0b2c0fff208fcc11c13d71723f))
- **xlsx:** store data validations as ranges ([09c2a40](https://github.com/cjnoname/excelts/commit/09c2a4062c2a4daf1b703dfca195fff0f8dc1987))

### Bug Fixes

- **build:** rewrite tsconfig path aliases in dist outputs ([6791d4e](https://github.com/cjnoname/excelts/commit/6791d4ea91f0296f70a9914d9817fc96cc3e6f53))
- post-merge csv parsing + pivot test import ([8f31be3](https://github.com/cjnoname/excelts/commit/8f31be3b6afd806363d419f3f88365229023a11c))
- **security:** address CodeQL findings ([77dafd9](https://github.com/cjnoname/excelts/commit/77dafd9c012bf6ca45f6ec245d320c7edc1ab7ed))
- **stream:** avoid extra args in browser transform ([6ddacdd](https://github.com/cjnoname/excelts/commit/6ddacddf719aaf784100179dabac26fdd29432bb))
- **stream:** handle browser transform/flush arity safely ([d80b29d](https://github.com/cjnoname/excelts/commit/d80b29de30d667125b51684cb3d2d0aa23bfe634))
- **stream:** make transform arity dispatch CodeQL-friendly ([4ffdd8b](https://github.com/cjnoname/excelts/commit/4ffdd8b66847e809a31ed0d43f69051793083bb2))
- **stream:** use direct call with known signature to satisfy CodeQL ([ea53170](https://github.com/cjnoname/excelts/commit/ea531702c0450c6116c26538da17e48f16c2f6a3))
- **stream:** use proper type assertion for userFlush call ([51d781c](https://github.com/cjnoname/excelts/commit/51d781ca286c7747789bb066071112dd5012bb80))
- **test:** align csv mapper typing ([ab0d509](https://github.com/cjnoname/excelts/commit/ab0d509c1c1d8b8867a6a4ec1be9f74686f03888))

### Performance Improvements

- **csv:** optimize streaming parser hot path ([50bf1ef](https://github.com/cjnoname/excelts/commit/50bf1ef27b59eb8994934262c5deb2217b3346af))

## [3.1.0](https://github.com/cjnoname/excelts/compare/v3.0.1...v3.1.0) (2025-12-30)

### Features

- **csv:** support decimalSeparator option ([418eccf](https://github.com/cjnoname/excelts/commit/418eccf56d8ce94127b89a913f6194743d7157d1)), closes [#20](https://github.com/cjnoname/excelts/issues/20)
- **row:** add getValues and valuesToString helpers ([9dca08f](https://github.com/cjnoname/excelts/commit/9dca08f1ad30144121719ad65b4eb622eef66226)), closes [#19](https://github.com/cjnoname/excelts/issues/19)

## [3.0.1](https://github.com/cjnoname/excelts/compare/v3.0.0...v3.0.1) (2025-12-28)

### Bug Fixes

- PivotTable not forming correctly when rows and values fields are equal ([#15](https://github.com/cjnoname/excelts/issues/15)) ([d3eb98d](https://github.com/cjnoname/excelts/commit/d3eb98d2e04a54d05ec3895ec6f3ee49d90a520a))

## [3.0.0](https://github.com/cjnoname/excelts/compare/v2.0.1...v3.0.0) (2025-12-28)

### ⚠ BREAKING CHANGES

- dyDescent is no longer output by default for new worksheets

### Bug Fixes

- correct Table headerRowCount parsing per ECMA-376 ([6cc6016](https://github.com/cjnoname/excelts/commit/6cc60169b2cd6934b28bbff844195a184990af08))
- improve XML output to match Excel's minimal format ([379d895](https://github.com/cjnoname/excelts/commit/379d895a52b33cfa1c3815953d59d4170e3ca7ec))
- make dyDescent optional per ECMA-376 minimum output principle ([76f9c2b](https://github.com/cjnoname/excelts/commit/76f9c2b7b87d659f254836b8c92c2bfc071be3d6))
- resolve PivotTable XML generation bugs (Issue [#5](https://github.com/cjnoname/excelts/issues/5)) ([d564470](https://github.com/cjnoname/excelts/commit/d564470c3989405a5d4783c669727723cfe020e2))

## [2.0.1](https://github.com/cjnoname/excelts/compare/v2.0.0...v2.0.1) (2025-12-28)

### Bug Fixes

- correct PivotTable XML generation for rowItems, colItems, and recordCount ([2e956a6](https://github.com/cjnoname/excelts/commit/2e956a6e39be34db854f1d7d56cfca2646b98dc6))

## [2.0.0](https://github.com/cjnoname/excelts/compare/v1.6.3...v2.0.0) (2025-12-26)

### ⚠ BREAKING CHANGES

- **deps:** All external runtime dependencies removed
- **datetime:** dayjs is no longer used internally
- Minimum Node.js version is now 20.0.0. Node.js 18 is no longer supported.
- TypeScript configuration now uses bundler moduleResolution

### Features

- **browser:** add pure JavaScript DEFLATE fallback for older browsers ([2a9c29c](https://github.com/cjnoname/excelts/commit/2a9c29cc7020d9834883827142330d136706f07b))
- **browser:** native browser support with zero config ([ea3620c](https://github.com/cjnoname/excelts/commit/ea3620cd363d7fa0c2d8c62293e7b222c2687066))
- **csv:** implement native CSV parser with browser support ([9e9ff9c](https://github.com/cjnoname/excelts/commit/9e9ff9c9e1d9548327a9c6d668f09fb0782d4dda))
- **worksheet:** add column page breaks support ([ad90492](https://github.com/cjnoname/excelts/commit/ad90492a29b6b21f618f0533e20c1e505804e6c6))

### Bug Fixes

- **security:** address CodeQL security warnings ([e89b618](https://github.com/cjnoname/excelts/commit/e89b618872e488e9b5c677fae3389610574817db))

### Performance Improvements

- **datetime:** replace dayjs with high-performance native datetime utilities ([f804811](https://github.com/cjnoname/excelts/commit/f8048114d5a1dbd043017d688976d14172acb867))
- **sax:** optimize XML SAX parser with lookup tables and fast paths ([4dc99eb](https://github.com/cjnoname/excelts/commit/4dc99ebd548f669b38f96e76d7db9ed3078210d5))

### Miscellaneous Chores

- **deps:** remove all runtime dependencies ([15e7b50](https://github.com/cjnoname/excelts/commit/15e7b501344042bb8240eb5404df0bc21b59202e))
- drop Node.js 18 support, require Node.js 20+ ([9568b93](https://github.com/cjnoname/excelts/commit/9568b9354d8fc84a18c03822d2f49e35acd57f3c))

### Code Refactoring

- switch TypeScript moduleResolution from nodenext to bundler ([73c5d94](https://github.com/cjnoname/excelts/commit/73c5d941ae2cd18c99752e3e22415cbb23353cd5))

## [1.6.3](https://github.com/cjnoname/excelts/compare/v1.6.2...v1.6.3) (2025-12-24)

### Bug Fixes

- **docs:** add Vite polyfill configuration for browser usage ([0b06ae9](https://github.com/cjnoname/excelts/commit/0b06ae93fa98dfeb04b17a14de1553df8c8ce526))

## [1.6.2](https://github.com/cjnoname/excelts/compare/v1.6.1...v1.6.2) (2025-12-20)

### Miscellaneous Chores

- release 1.6.2 ([d075b45](https://github.com/cjnoname/excelts/commit/d075b45009aee8e699f02d9ba4f3926415250946))

## [1.6.1](https://github.com/cjnoname/excelts/compare/v1.5.0...v1.6.1) (2025-12-18)

This release includes all changes from 1.6.0 (which was not published to npm).

### Features

- add release-please for automated releases ([735d7ef](https://github.com/cjnoname/excelts/commit/735d7efc114a7aa1c1ebbbbae9894ed2a971dc66))
- **column:** support CellValue types for column headers (fixes [#2740](https://github.com/cjnoname/excelts/issues/2740)) ([18a6eb6](https://github.com/cjnoname/excelts/commit/18a6eb617607e14cf968ebe7f9d72f71c387f7ef))
- **pivot-table:** enhance pivot table support with multiple improvements ([ad9f123](https://github.com/cjnoname/excelts/commit/ad9f123cfe7739438f3bfaf5b96fc70966d68de8))
- **pivot-table:** implement pivot table read and preserve functionality (Issue [#261](https://github.com/cjnoname/excelts/issues/261)) ([9883e5c](https://github.com/cjnoname/excelts/commit/9883e5c6484fe3a15d6d386b22e64fb0cb418839))

### Bug Fixes

- **ci:** add npm publish job to release-please workflow ([a84e54e](https://github.com/cjnoname/excelts/commit/a84e54e2e238e349fe0218af41036d987a8aa089))
- **ci:** add outputs to release-please for better integration ([cddf12a](https://github.com/cjnoname/excelts/commit/cddf12ada88a9e172388c24a61699edc409a0619))
- **pivot-table:** correctly link pivot cache data using pivotCaches from workbook.xml (Issue [#1678](https://github.com/cjnoname/excelts/issues/1678)) ([3bfc50e](https://github.com/cjnoname/excelts/commit/3bfc50eda13f0454cdd3f5a6d01cc7b988153ccb))
- simplify release-please to only manage versions, keep tag-based npm publish ([f1236e6](https://github.com/cjnoname/excelts/commit/f1236e6f36e783cf8012ae29f7dd6c79746f9c64))
- **xlsx:** correct worksheet file naming and pivot table linking (fixes [#2315](https://github.com/cjnoname/excelts/issues/2315)) ([84144cc](https://github.com/cjnoname/excelts/commit/84144cc99a8143810f7bd08d65305ca0b8e352e1))

## [Unreleased]

### Added

- **csv:** unified `workbook.readCsv(input, options)` entry for reading from string/ArrayBuffer/Uint8Array/File/Blob/stream
- **csv:** `workbook.writeCsv(options)` and `workbook.writeCsvBuffer(options)` for writing
- **csv:** `workbook.readCsvFile()` / `workbook.writeCsvFile()` for Node.js file I/O
- **csv:** `createCsvParserStream()` and `createCsvFormatterStream()` factory functions
- **csv:** `detectDelimiter()` helper export
- **csv:** standalone `parseCsvAsync()`, `parseCsvRows()`, `parseCsvWithProgress()` for non-workbook usage
- **archive:** TAR archive support (`TarArchive`, `TarReader`, `tar()`, `untar()`)
- **archive:** ZIP editor (`ZipEditor`, `editZip()`, `ZipEditPlan`)
- **archive:** HTTP range reading (`RemoteZipReader`, `HttpRangeReader`)
- **archive:** ZIP/TAR encryption support (ZipCrypto, AES-256)
- **archive:** Gzip/Zlib compression (`gzip()`, `gunzip()`, `zlib()`, `unzlib()`)
- **archive:** ZIP64 large file support
- **archive:** progress/abort support for all archive operations
- **stream:** new subpath export `@cj-tech-master/excelts/stream`
- **stream:** cross-platform stream error classes (`StreamError`, `StreamStateError`, `StreamTypeError`)
- **stream:** type guards (`isReadableStream`, `isWritableStream`, `isAsyncIterable`, `isTransformStream`)
- **excel:** structured error hierarchy (16 typed error classes extending `ExcelError`)
- **package:** subpath exports for `./zip`, `./csv`, `./stream`

### Removed

- **csv:** `workbook.csv` accessor (use `workbook.readCsv()`, `workbook.writeCsv()`, etc. directly)
- **csv:** legacy type aliases `CsvReadOptions`, `CsvWriteOptions`, `CsvStreamReadOptions`, `CsvStreamWriteOptions` (use `CsvOptions`)
- **stream:** `BufferChunk` (renamed to `ByteChunk`)
- **stream:** `normalizeWritable` / `Writeable` (replaced by `toWritable`)
- **stream:** `EventEmitter` no longer re-exported from stream module (moved to `@utils/event-emitter`)
- **stream:** `once` function (replaced by `onceEvent`)
- **stream:** binary utilities (`textEncoder`, `stringToUint8Array`, etc.) no longer re-exported from stream module (moved to `@utils/binary`)
- **stream:** `ReadWriteBufferOptions` type
- **archive:** `UnzipEntry.isDirectory` (replaced by `UnzipEntry.type: "file" | "directory" | "symlink"`)
- **archive:** archive APIs removed from browser main entry (use `@cj-tech-master/excelts/zip` subpath instead)

### Breaking Changes

- **csv:** `workbook.csv` accessor removed; use `workbook.readCsv()` / `workbook.writeCsv()` / `workbook.writeCsvBuffer()` / `workbook.readCsvFile()` / `workbook.writeCsvFile()` directly
- **csv:** when no delimiter is provided, parsing now auto-detects the delimiter (previously defaulted to ","); pass `delimiter: ","` to keep the old behavior
- **csv:** removed type aliases `CsvReadOptions`, `CsvWriteOptions`, `CsvStreamReadOptions`, `CsvStreamWriteOptions`; use `CsvOptions` instead
- **csv:** parse option `transform` renamed to `rowTransform`; format option `rowDelimiter` renamed to `lineEnding`
- **stream:** `BufferChunk` renamed to `ByteChunk`
- **stream:** `normalizeWritable` / `Writeable` replaced by `toWritable`
- **stream:** `BufferedStream.toUint8Array()` now consumes the buffer (resets to empty after call)
- **archive:** `UnzipEntry.isDirectory` removed; use `entry.type === "directory"` instead
- **archive:** archive APIs removed from browser main entry; use `@cj-tech-master/excelts/zip` subpath
- **excel:** `Image` type renamed to `ImageData` (deprecated alias preserved)
- **excel:** `ZipOptions` renamed to `WorkbookZipOptions` (deprecated alias preserved)
- **eventemitter:** `emit("error")` now throws if no listener (matches Node.js behavior)

## [1.5.0] - 2025-12-13

### Added

- `ZipParser` class for cross-platform ZIP parsing (browser + Node.js)
- `extractAll`, `extractFile`, `listFiles`, `forEachEntry` now work in browser environments
- Native `DecompressionStream` support for browser decompression
- Comprehensive tests for new zip-parser module

### Changed

- Refactored `extract.ts` to use `ZipParser` instead of Node.js streams
- Updated tests to use `TextDecoder` instead of `Buffer.toString()`

### Removed

- Unused `global.d.ts` type declarations

### Breaking Changes

- `extractAll`, `extractFile`, `forEachEntry` now return `Uint8Array` instead of `Buffer`

## [1.4.5] - 2025-12-10

### Added

- Proper typing for `Row` and `Cell` classes with JSDoc comments
- Type safety improvements across `Row`, `Cell`, `Anchor`, `Column`, `Range`, `Image`, `Table` and stream classes

### Changed

- Relaxed return types for row methods (`getRow`, `findRow`, `eachRow`) to improve flexibility

## [1.4.4] - 2025-12-08

### Changed

- Replaced fflate with native zlib for ZIP compression (performance improvement)

### Fixed

- Ignore dynamicFilter nodes in filterColumn parsing (#2972)
- Prevent memory overflow when loading files with many definedNames (#2925)
- Prevent string formula results from being converted to date (#2970)
- Handle missing `r` attribute in row and cell elements (#2961)

## [1.4.3] - 2025-12-05

### Fixed

- Date and duration format handling

## [1.4.2] - 2025-12-04

### Changed

- Relaxed performance test thresholds for CI and Windows compatibility

## [1.4.1] - 2025-12-03

### Changed

- Optimized parsing of large data validation ranges (performance improvement)

## [1.4.0] - 2025-12-02

### Changed

- Code cleanup and optimizations

## [1.3.0] - 2025-11-28

### Changed

- Updated all dependencies to latest versions

### Added

- Cell format parser
- Improved browser compatibility

## [1.1.0] - 2025-11-15

### Added

- Major improvements and bug fixes

## [1.0.0] - 2025-10-30

### 🎉 First Stable Release

This is the first stable 1.0 release of ExcelTS! The library is now production-ready with comprehensive features, excellent TypeScript support, and thorough testing.

### Added

- Full TypeScript rewrite with strict typing
- Named exports for better tree-shaking
- Browser testing support with Playwright
- Husky v9 for Git hooks
- lint-staged for pre-commit checks
- Prettier configuration for consistent code style
- .npmignore for optimized package publishing
- Comprehensive browser and Node.js version requirements documentation

### Changed

- Public API and packaging updates
- All default exports converted to named exports
- Updated all dependencies to latest versions
- Migrated testing framework from Mocha to Vitest
- Switched bundler from Webpack to Rolldown
- Build system using tsgo (TypeScript native compiler)
- Target ES2020 for better compatibility
- Node.js requirement: >= 18.0.0 (previously >= 12.0.0)
- Browser requirements: Chrome 85+, Firefox 79+, Safari 14+, Edge 85+, Opera 71+

### Improved

- Enhanced type safety with proper access modifiers
- Performance optimizations in build process
- Reduced package size by excluding source files from npm publish
- Optimized IIFE builds with conditional sourcemaps
- Better error handling and logging (development-only console warnings)
