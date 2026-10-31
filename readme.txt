=== Fena Media Manager ===
Contributors: nedzadomeragic
Donate link: https://www.paypal.me/nedzadomeragic
Tags: media library, media folders, folders, organize media, media
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Virtual folders for the WordPress media library. Organize media in folders and subfolders without moving files on the server.

== Description ==

Fena Media Manager adds a folder sidebar to the native WordPress media library. Create folders and subfolders, drag media into them and find files faster – directly in Media > Library, in the list view and in the media modal.

Folders are virtual. They are stored as a private WordPress taxonomy, so **files are never moved or renamed on the server**. File paths, URLs, attachment IDs and metadata stay exactly as they are, and existing links and embedded images keep working. One file can be in several folders at the same time.

The plugin uses no custom database tables, loads no external resources and needs no account. Deactivating or deleting it keeps all folders, assignments and settings in the database.

= Folders and subfolders =

* Folder sidebar next to the media grid, with "All Media", "Unassigned" and a media count per folder.
* Subfolders in any depth, shown as a collapsible tree.
* Create, rename, move and delete folders. Deleting a folder never deletes media; its subfolders move up one level.
* "Move to…" dialog to move a folder to another parent or to the top level. Circular hierarchies and duplicate names in the same place are prevented.
* Instant folder search (case- and accent-insensitive) that also finds nested subfolders.
* Five sort orders: name A–Z, name Z–A, newest, oldest and manual order. The sort order is saved per user.
* Six editable example folders are created once on first activation if no folders exist yet.

= Assigning media =

* Drag and drop one file or a selection onto a folder. Inside an open folder, dropping moves the media to the target folder; hold Ctrl (Cmd on Mac) to add it instead.
* Drag and drop folders to reorder them or to move them into another folder.
* Bulk selection in the grid: add, move or remove the selection per folder.
* List view: folder filter and the bulk actions "Add to folder" and "Remove from folder".
* Folder checkboxes in the attachment details.
* Folder filter in the media modal, for example when choosing an image in the block editor.
* A folder shows only its own media, not the media of its subfolders.

= Folder colors and icons =

* Gray (default), blue, violet, sand, green or a custom color. Only the folder symbol is colored.
* Optional icon per folder: image, video, document, audio, archive, star, people or tag.
* Colors and icons are set in an "Appearance" dialog with a live preview.

= Folder Lock =

Lock a folder to prevent accidental changes to your folder structure. A locked folder and its subfolders cannot be renamed, moved, reordered or deleted, and no new subfolders can be created inside them. Opening the folder, uploading into it and assigning or removing media still work.

Folder Lock is not an access protection. Locked folders and their media remain visible and usable for everyone who has access to the media library.

= Uploads =

* Files uploaded while a folder is open are assigned to that folder, in the media library and in the media modal.
* Optional default upload folder for uploads started while "All Media" is selected.
* Upload progress panel in the media grid with progress per file and in total, a processing state and the WordPress error message for failed uploads. The panel only shows the progress of the regular WordPress uploader; it does not upload files itself.

= Keyboard shortcuts and accessibility =

While the keyboard focus is in the folder sidebar:

* Arrow Up / Arrow Down: move between folders
* Enter: open the focused folder
* Shift + N: new folder
* F2: rename the focused folder
* Delete (Backspace on Mac): delete the focused folder, after confirmation
* Ctrl + Arrow Up / Arrow Down (Cmd on Mac): change the manual order
* ?: show the keyboard shortcuts

Shortcuts are ignored while typing and in the media grid itself, so WordPress and browser shortcuts are not affected. A "Keyboard shortcuts" button in the sidebar shows the same help.

All actions are available by keyboard. Drag and drop has keyboard alternatives ("Move to…", "Move up" / "Move down", bulk buttons and checkboxes). Buttons have screen reader labels, dialogs manage focus and notices are announced to screen readers.

= Collapsible folder panel =

The folder sidebar can be collapsed so the media grid uses the full width, and opened again with one click. On phones the folders open as a drawer over the media. The animation is turned off when the operating system is set to reduce motion.

= Import and export of the folder structure =

Export your folder structure as a JSON file and import it on another site, for example from a staging site to a live site.

* The export contains folder names, the hierarchy, the manual order, colors and icons.
* **Media files and media assignments are not exported or imported.** Attachment IDs, users, settings and lock states are not included either.
* Before importing, the file is validated and a preview shows what will be created. Folders that already exist can be merged or skipped.
* An import never changes or deletes existing folders or media.
* Limits: 512 KB file size, 2,000 folders, 10 levels.

= Settings =

Media > Fena Media Manager (administrators only):

* Default sort order for users who have not chosen one.
* Folder tree on load: collapsed or expanded.
* Restore the last opened folder (saved per user in the browser).
* Default upload folder.
* Import and export of the folder structure.

= Roles and permissions =

* Administrators and editors can create, rename, move, delete, lock and style folders (capability `edit_others_posts`).
* Every user who may upload and edit a media file can assign it to existing folders. Authors, for example, can organize their own media.
* The settings page and import/export require the `manage_options` capability (administrators).
* Permissions, nonces and Folder Lock are checked on the server for every request.

= Free and independent =

Fena Media Manager is free, with all features included. It works with any theme and does not depend on other plugins. If you find it useful, you can support its development with a voluntary donation via PayPal; the link on the settings page is optional.

== Installation ==

1. In your WordPress admin, go to Plugins > Add New Plugin and search for "Fena Media Manager", or upload the plugin ZIP via Plugins > Add New Plugin > Upload Plugin.
2. Activate the plugin.
3. Open Media > Library in the grid view and use the folder sidebar.
4. Optional: adjust the defaults in Media > Fena Media Manager.

== Frequently Asked Questions ==

= Are files moved on the server? =

No. Folders are virtual. Files stay in the WordPress uploads directory, and file paths, URLs, attachment IDs and metadata are never changed.

= Can a file be in more than one folder? =

Yes. A file can be assigned to any number of folders. "Unassigned" shows all files without a folder.

= What happens when I delete a folder? =

Only the folder is removed. Its media stays in the media library, and its subfolders move up one level. Deleting always asks for confirmation.

= Does Folder Lock protect files from other users? =

No. Folder Lock only prevents accidental changes to the folder structure (rename, move, reorder, delete, new subfolders). It does not hide files or restrict access to them.

= Does the export include my media files? =

No. The JSON export contains only the folder structure: names, hierarchy, manual order, colors and icons. Media files and media assignments are not transferred. To move media between sites, use the WordPress export/import tools or a migration plugin.

= What happens to my folders when I deactivate or delete the plugin? =

Nothing is deleted. Folders, assignments and settings remain in the database and are available again after reactivation.

= Which uploads use the default upload folder? =

Uploads started in the media library grid or in the media modal while "All Media" is selected. An open folder always takes precedence, and uploads started in "Unassigned" stay unassigned. Uploads via the "Add New Media File" page, the REST API or code are not affected.

= Does the block editor's inserter show folders? =

The "Media" tab of the block inserter does not support folders. The media modal, opened with the "Media Library" button of a block, has the folder filter.

= Can the permissions or default folders be changed? =

Yes, with the filters `fmm_manage_folders_capability` (default `edit_others_posts`) and `fmm_default_folders`.

`fmm_manage_folders_capability` is security relevant: every user with the returned capability may create, rename, move and delete folders for the whole site. Return a capability that only trusted roles have, never `read` or `upload_files`. Assigning media is not affected; it always requires `upload_files` and permission to edit the media file.

= Does the plugin contact external services? =

No. The plugin sends no data to external services. The optional donation button on the settings page is a regular link to PayPal.Me that opens only when you click it.

== Screenshots ==

1. Folder sidebar next to the media library grid.
2. Folder menu with rename, move, appearance and lock actions.
3. Appearance dialog with folder colors and icons.
4. Upload progress panel.
5. Keyboard shortcuts help.
6. Settings page with import and export of the folder structure.

== Credits ==

Interface icons: Heroicons by Tailwind Labs, Inc. (https://heroicons.com), MIT License.

== Changelog ==

= 1.0.0 =
* Initial release.
* Virtual folders and subfolders in the media library grid, with "All Media", "Unassigned" and media counts.
* Multiple folders per file; assignment by drag and drop, bulk selection, list view bulk actions and attachment details.
* Folder filter in the grid, list view and media modal.
* Move and reorder folders with "Move to…", drag and drop and five sort orders.
* Instant folder search.
* Folder colors, custom colors and optional folder icons.
* Folder Lock to prevent accidental changes to the folder structure.
* Uploads into the open folder, optional default upload folder and an upload progress panel.
* Keyboard shortcuts with a built-in help and a collapsible folder panel.
* JSON import and export of the folder structure with validation and preview.
* Settings page with default sort order, folder tree on load, restore last folder and default upload folder.

== Upgrade Notice ==

= 1.0.0 =
Initial release.
