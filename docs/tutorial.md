# Run locally

A running Tarang instance is required. The examples assume it listens at `http://127.0.0.1:3000`.

1. Install Node.js 20.11 or later and pnpm. Open a terminal in the repository root.
2. Install the locked dependencies:

   ```sh
   pnpm install --frozen-lockfile
   ```

3. Start the build watcher with the API origin. In a POSIX shell:

   ```sh
   TARANG_API_BASE=http://127.0.0.1:3000 pnpm dev
   ```

   In PowerShell:

   ```powershell
   $env:TARANG_API_BASE = 'http://127.0.0.1:3000'
   pnpm dev
   ```

4. Open a second terminal in the repository root and start the local server:

   ```sh
   pnpm serve
   ```

5. Open `http://localhost:8080`. The feed list loads from Tarang. An empty instance displays an empty list. Use Add Follow with an RSS, Atom, or JSON Feed URL to subscribe. A site homepage URL is not a feed discovery request.
6. Edit a file under `src/`. The watcher rebuilds `dist/`; reload the browser to display the change.

Stop both commands with Ctrl+C. The local server only serves files; it does not start Tarang or rebuild assets. If feeds do not load, inspect the browser's request to `http://127.0.0.1:3000/tarang/v1/summary` and confirm that Tarang is reachable and permits the frontend origin through CORS.

## Manage feeds in a category

Open a category and frequency, then select Manage feeds. Checkboxes appear beside the feeds on the page, with bulk actions above the list. Select individual feeds or Select all, choose an action, and apply it to the selection. Only feeds at the current frequency are included. Available actions change importance, move feeds to an existing or new category, or delete feeds and their cached articles. A blank destination moves feeds to Home. Deletion requires confirmation.

Updates apply separately to each feed. Successful updates clear from the selection; failed updates remain selected for retry. Changing category or frequency, or toggling Manage feeds off, clears the selection. An update already in progress continues after the controls are hidden.
