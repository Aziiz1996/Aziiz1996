# Private novel reader

An isolated deployment branch for the author's illustrated novel reader.

Requires BOOK_KEY and READER_PASSWORD in the deployment environment. The book assets are AES-256-GCM encrypted. No manuscript plaintext or credentials belong in this branch. This branch does not modify the main application.

The reading platform provides a library, individual illustrated page images, chapter selection, page thumbnails, zoom and browser-local reading-position restoration. UI sources are in `ui/`; manuscript and page artwork remain in the authenticated encrypted bundle. The library and reader shells render content before application scripts run, and only the selected page plus the next image are loaded.
