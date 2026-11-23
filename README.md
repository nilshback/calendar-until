# Calendar Until

A personal daily journal from November 23, 2026 through September 23, 2027. Scroll the month grids, switch to a list, or tap a date to write. The editor becomes read-only on September 24 in the device’s local time.

## Open the calendar

Serve the repository root using a local web server, or configure GitHub Pages to publish the root of main. On iPhone, open the HTTPS site in Safari and add it to the Home Screen. After its first online load, the site can open offline.

## Connect devices

1. Keep nilshback/calendar-until private. Publish the app from main. The separate journal-data branch holds journal.json and its Git history. Anyone with read access to the repository can read those entries.
2. In GitHub, create a fine-grained personal access token for this repository only. Grant Contents read and write. A read-only token suffices for a device used only to read existing entries.
3. Open the calendar on each device, select **Connect sync**, enter a token, then select **Connect this device**. **Remember on this device** stores the token in that browser profile. Otherwise the token lasts until you reload or close the page.
4. Check for **Synced** before switching devices. The app checks on opening, on returning to the app, after typing, and every minute while visible. Local entries waiting for upload survive closing the page. If two devices change the same note independently, both versions appear in the entry for review.

GitHub retains the history of synced notes, including earlier versions after edits or deletions. Backups download as plain JSON. Keep them somewhere private. The cutoff is enforced by the app using local device time. Sync pending edits before the cutoff. Reading previously synced entries continues afterward.
