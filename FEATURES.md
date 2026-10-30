# Fena Media Manager 1.0.0 – Features

Fena Media Manager adds virtual folders to the native WordPress media library.
This document lists the features that are implemented in version 1.0.0.

## Core principles

- **Virtual folders only.** Folders are a private, hierarchical attachment
  taxonomy (`fmm_folder`). Files, URLs, attachment IDs and attachment
  metadata are never changed or moved on disk.
- **No custom database tables.** Folders are terms, folder settings are term
  meta, preferences are user meta and plugin options.
- **Nothing is deleted on deactivation or uninstall.** Folders and
  assignments stay in the database.
- **Independent plugin.** No theme dependency, no external services, no build
  step and no runtime dependencies. Icons are bundled Heroicons (MIT).
- **Free.** All features are available to everyone; there is no Pro version.

## Folders and subfolders

- Create, rename and delete folders from the folder sidebar.
- Subfolders in any depth, shown as a collapsible tree with expand/collapse
  buttons.
- Folder names are unique among siblings (case-insensitive); names that
  WordPress would alter (HTML, line breaks, leading/trailing spaces) are
  rejected. Maximum name length: 200 characters.
- Deleting a folder never deletes media. Its subfolders move up one level.
  Deletion is confirmed in an accessible dialog.
- Move a folder to another parent or to the top level with the **Move to…**
  dialog (hierarchical destination list). Moving a folder into itself or one of
  its subfolders is not possible. On a name conflict the dialog offers to move
  the folder under a new name.
- On first activation six default folders are created (Hero Images, Hero
  Slider, Blog Images, Backgrounds, Logos & Icons, Videos), only if no folders
  exist yet. The list can be changed with the `fmm_default_folders` filter.

## Media assignment

- One media file can be in several folders at once.
- **All Media** shows every file, **Unassigned** shows files without a folder.
- A folder shows only its own media, not the media of its subfolders. Folder
  counts follow the same rule.
- Assign selected media in the grid's bulk-select mode with per-folder
  buttons: **+** adds the selection to a folder, **→** moves it from the open
  folder to another folder, **−** removes it from a folder. Only the named
  folders change; other assignments stay.
- Folder checkboxes in the attachment details (edit screen and media modal).
- List view: folder filter dropdown (including Unassigned with its count) and
  the bulk actions **Add to folder** and **Remove from folder**.
- Media modal (e.g. in the block editor): folder filter dropdown next to the
  core filters.

## Drag and drop

- **Media:** drag one file or the current selection from the grid onto a
  folder. Inside an open folder, dropping onto another folder moves the media
  (removes it from the open folder); holding Ctrl/Cmd adds it instead. From All
  Media or Unassigned, dropping always adds.
- **Folders:** every folder row has three drop zones:
  - top 30 %: place the folder **before** this row, on this row's level;
  - bottom 30 %: place it **after** this row, on this row's level;
  - middle 40 %: move it **into** this folder (after its existing subfolders).
  This also moves subfolders up a level or to the top level. The bottom edge
  of an expanded folder drops into it. An indented line or a highlight shows
  the exact target before dropping; invalid targets show nothing.
- Reordering by drag and drop needs the manual sort order. Moving to another
  level works in every sort order.
- Drag and drop is not available by keyboard. Every action has an accessible
  alternative: **Move to…**, **Move up/Move down**, the bulk-select assign
  buttons and the attachment details checkboxes.

## Search, sorting and order

- Folder search in the sidebar: case- and accent-insensitive (e.g. "cafe"
  finds "Café"), matches are highlighted and their parent folders are shown.
  The list updates shortly after typing stops. Escape clears the search;
  ArrowDown moves to the first result; the number of results is announced to
  screen readers.
- Sort orders: Name (A–Z), Name (Z–A), Newest first, Oldest first, Manual
  order. The sort menu is a compact menu button.
- The sort order is saved per user. Users without a choice get the default
  from the settings page.
- Manual order: drag and drop or **Move up/Move down** in the folder menu.

## Folder appearance

- **Appearance…** dialog per folder with a live preview.
- Colors: Gray (default), Blue, Violet, Sand, Green, or a custom color via a
  color picker and a hex field (`#rrggbb`).
- Icons: Default folder or one of eight icons shown next to the folder
  symbol: Image, Video, Document, Audio, Archive, Star, People, Tag.
- The open folder shows an open folder symbol, all others a closed one.
- Defaults (gray, no icon) store nothing.

## Folder Lock

- **Lock folder / Unlock folder** in the folder menu; a small lock icon marks
  locked folders.
- A locked folder and everything below it cannot be renamed, moved, deleted,
  reordered or given new subfolders, and no folder can be moved into it. A
  folder that contains a locked folder cannot be moved or deleted.
- Still allowed: opening the folder, assigning and removing media, uploading
  into it, changing color and icon.
- The lock is enforced on the server for every change route (REST and JSON
  import), not only in the interface.
- Folder Lock protects the structure only. It is not a password or access
  protection, and it is not included in the JSON export.

## Uploads

- Uploading while a folder is open assigns the new files to that folder.
- Optional default upload folder (settings): used when **All Media** is open.
  An open folder always takes precedence; uploads in **Unassigned** stay
  unassigned.
- Upload progress panel in the media grid (bottom right): file name, size,
  real progress per file and in total, "Processing…" while the server creates
  image sizes, success or the WordPress error message per file, collapsible
  while uploading and closable when finished.
- The panel only listens to the WordPress uploader. It does not upload files
  itself and sends no extra requests. Percentages are only shown when the
  browser reports real progress. It is shown in the media grid only.

## Folder sidebar and interface

- Full-height folder column next to the media grid, with pinned header,
  search and sort, and an internally scrolling folder list.
- Folder action menu per folder (Rename, Move to…, Appearance…, Move up/down,
  Lock/Unlock, Delete; only the actions that are possible are shown).
- **New subfolder** button per folder and **New Folder** button in the header;
  inline input for creating and renaming.
- Optional restore of the last opened folder (saved per user in the browser).
- Success and error notices in the sidebar; dialogs for Delete, Move to… and
  Appearance.
- Designed for large folder trees (tested with 2,000 folders).
- **Collapsible folder panel:** a button next to New Folder collapses the
  sidebar so the media grid uses the full width; a violet button before the
  page heading opens it again. The panel slides in and out (no animation
  with reduced motion). On tablets the stacked panel folds away.
- On phones (up to 600 px) the folders open as a slide-in drawer over the
  media, closed by default; it closes with its button, a tap outside,
  Escape or after choosing a folder. The open button stays reachable while
  scrolling.
- The collapsed state is not saved; after reloading, the panel is open on
  desktop and tablet and closed on phones.

## Keyboard shortcuts

Shortcuts work while the keyboard focus is in the folder sidebar. They are
ignored while typing (search field, inline name field), while a dialog or menu
is open, during drag and drop, and in the media grid itself, so WordPress and
browser shortcuts are not affected.

| Shortcut | Action |
|---|---|
| ↑ / ↓ | Move between the visible folders (↑ on the first row goes to the search field) |
| Enter | Open the focused folder |
| Shift + N | New folder |
| F2 (Mac: fn + F2) | Rename the focused folder |
| Delete (Mac: ⌫ or Delete) | Delete the focused folder (always asks for confirmation) |
| Ctrl + ↑ / ↓ (Mac: ⌘ + ↑ / ↓) | Move the folder up or down (manual order only, not while searching) |
| ? | Show or hide the keyboard help |

- A **Keyboard shortcuts** button next to the sort button opens the same help
  without a shortcut. The help shows the modifier keys for the current
  platform (⌘ on Mac, Ctrl on Windows/Linux) and only lists the shortcuts the
  current user may use.
- Shortcuts follow the same rules as the folder menu: permissions and Folder
  Lock are respected. If an action is not possible, nothing happens and screen
  readers hear a short message (for example "Folder “X” is locked.").
- Users without permission to manage folders can use navigation, Enter and
  the help only.
- There is no shortcut for showing or hiding the folder sidebar.

## Import and export

- Export the folder structure as a JSON file: names, hierarchy, manual order,
  colors and icons.
- Import with validation and a preview before anything is written. Existing
  folders with the same name can be merged or skipped. Existing folders are
  never changed or deleted.
- Limits: 512 KB file size, 2,000 folders, 10 levels.
- **Not transferred:** media files, media assignments, attachment IDs, users,
  settings and lock states. Older export files without icons can still be
  imported.

## Settings

Media → Fena Media Manager (administrators):

- Default sort order for users without their own choice.
- Folder tree on load: collapsed or expanded.
- Restore last folder.
- Default upload folder.
- Import / Export.
- Optional donation link (PayPal.Me, opens in a new tab). The plugin works
  fully without it.

## Permissions and security

- Managing folders (create, rename, move, delete, reorder, appearance, lock)
  requires the `edit_others_posts` capability by default (Editors and
  Administrators). It can be changed with the
  `fmm_manage_folders_capability` filter.
- Assigning media requires `upload_files` and permission to edit each
  attachment; this is checked on the server for every file.
- The settings page requires `manage_options`.
- All REST routes (`fmm/v1`) check permissions and nonces; input is
  sanitized and output escaped.

## Accessibility and responsive design

- Keyboard support for the folder tree (arrow keys and shortcuts, see
  above), menus (arrow keys, Home/End, Escape), dropdowns (select-only
  combobox pattern) and dialogs (focus trap, initial focus, focus return).
- Visible keyboard focus: a violet bar and background for menu and list
  entries, a focus ring for buttons and fields.
- Labels for all icon buttons; states such as expanded, selected, checked and
  disabled are exposed. Notices and search results are announced once.
- WCAG 2.2 AA contrast for text and form fields; minimum 24 × 24 px targets.
- Supports reduced motion, Windows high-contrast mode and right-to-left
  languages.
- Responsive layout down to 390 px; larger touch targets below 783 px.

## Developer notes

- Taxonomy `fmm_folder`; term meta `fmm_order`, `fmm_color`, `fmm_icon`,
  `fmm_locked`.
- REST namespace `fmm/v1`; query var `fmm_folder`.
- Filters: `fmm_default_folders`, `fmm_manage_folders_capability`,
  `fmm_donate_url`.
- Requires WordPress 6.4 and PHP 7.4 or later.

## Known limitations and ideas for later versions

Not part of 1.0.0; noted from the release check.

- JSON import is not all-or-nothing: if it stops midway, folders created
  before the error remain (the import summary lists them).
- Collapsing or expanding the panel with very large trees (about 1,000
  folders) can cause a short stutter while WordPress re-lays out the grid.
- No keyboard shortcut for collapsing the folder panel yet (a candidate is
  Shift + F); the collapsed state is not remembered after reloading.

## Feature summary (readme.txt draft)

Fena Media Manager brings clean, virtual folders to the WordPress media
library – without moving a single file.

* Folders and unlimited subfolders in a fast, full-height sidebar
* One file can live in several folders; "Unassigned" shows what is left
* Drag and drop for media and folders, with a clear drop indicator
* Folder colors, custom colors and optional folder icons
* Folder Lock to protect your folder structure
* Search, five sort orders and manual ordering
* Upload straight into a folder, with an optional default upload folder
* Upload progress panel with real progress and clear error messages
* Folder filter in the list view and the media modal, plus bulk actions
* Import and export of your folder structure as JSON
* Keyboard shortcuts for the folder tree, with a built-in shortcut help
* Keyboard and screen reader friendly, responsive, RTL-ready
* No files changed, no custom tables, nothing deleted on uninstall
* 100 % free – no Pro version
