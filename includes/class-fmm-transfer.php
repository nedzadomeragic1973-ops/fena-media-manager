<?php
/**
 * Import and export of folder structures (JSON).
 *
 * @package Fena_Media_Manager
 */

defined( 'ABSPATH' ) || exit;

/**
 * Exports the folder tree and imports it again after validation and a preview.
 * Only structure, names, colors, icons and manual order are transferred; media,
 * assignments, IDs and settings never are.
 */
class FMM_Transfer {

	/**
	 * File format identifier.
	 */
	const FORMAT = 'fena-media-manager/folders';

	/**
	 * File format version.
	 */
	const VERSION = 1;

	/**
	 * Maximum upload size in bytes.
	 */
	const MAX_BYTES = 524288;

	/**
	 * Maximum number of folders per file.
	 */
	const MAX_FOLDERS = 2000;

	/**
	 * Maximum folder depth (top level = 1).
	 */
	const MAX_DEPTH = 10;

	/**
	 * Maximum number of reported validation errors.
	 */
	const MAX_ERRORS = 20;

	/**
	 * JSON parser depth: only an outer guard, larger than any valid file needs.
	 */
	const PARSER_DEPTH = 64;

	/**
	 * Lifetime of a pending import.
	 */
	const TTL = 30 * MINUTE_IN_SECONDS;

	/**
	 * Option used as import lock.
	 */
	const LOCK = 'fmm_import_lock';

	/**
	 * Seconds after which a lock counts as stale.
	 */
	const LOCK_TTL = 300;

	/**
	 * Registers the admin-post handlers.
	 */
	public static function init() {
		add_action( 'admin_post_fmm_export', array( __CLASS__, 'handle_export' ) );
		add_action( 'admin_post_fmm_import_preview', array( __CLASS__, 'handle_preview' ) );
		add_action( 'admin_post_fmm_import_confirm', array( __CLASS__, 'handle_confirm' ) );
		add_action( 'admin_post_fmm_import_cancel', array( __CLASS__, 'handle_cancel' ) );
	}

	/**
	 * Settings page URL.
	 *
	 * @param string $state Value of the fmm_import query argument.
	 * @return string
	 */
	private static function page_url( $state = '' ) {
		$url = admin_url( 'upload.php?page=' . FMM_Settings::PAGE );

		return $state ? add_query_arg( 'fmm_import', $state, $url ) : $url;
	}

	/**
	 * Capability and nonce check shared by all handlers.
	 *
	 * @param string $action Nonce action.
	 */
	private static function authorize( $action ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'fena-media-manager' ), '', array( 'response' => 403 ) );
		}

		check_admin_referer( $action );
	}

	/**
	 * Redirects to the settings page and stops.
	 *
	 * @param string $state Value of the fmm_import query argument.
	 */
	private static function redirect( $state ) {
		wp_safe_redirect( self::page_url( $state ) );
		exit;
	}

	/**
	 * Key of a per-user transient.
	 *
	 * @param string $name Transient name.
	 * @return string
	 */
	private static function key( $name ) {
		return 'fmm_import_' . $name . '_' . get_current_user_id();
	}

	/**
	 * Stores the one-time notice shown after the redirect.
	 *
	 * @param string   $type    success, warning, error or info.
	 * @param string   $message Message.
	 * @param string[] $lines   Detail lines.
	 */
	private static function flash( $type, $message, $lines = array() ) {
		set_transient(
			self::key( 'result' ),
			array(
				'type'    => $type,
				'message' => $message,
				'lines'   => $lines,
			),
			5 * MINUTE_IN_SECONDS
		);
	}

	// ---------------------------------------------------------------- export.

	/**
	 * Folder tree in manual order as nested arrays (name, color, icon, children).
	 *
	 * @return array
	 */
	public static function export_tree() {
		$flat = FMM_Taxonomy::get_folder_tree( 'manual' );
		$pos  = 0;

		return self::nest( $flat, $pos, 0 );
	}

	/**
	 * Nests a depth-first list of folders.
	 *
	 * @param array $flat  Folders with `depth` in depth-first order.
	 * @param int   $pos   Current position (updated).
	 * @param int   $depth Depth of the nodes to collect.
	 * @return array
	 */
	private static function nest( $flat, &$pos, $depth ) {
		$out = array();

		while ( isset( $flat[ $pos ] ) && $flat[ $pos ]['depth'] === $depth ) {
			$folder = $flat[ $pos++ ];
			$node   = array( 'name' => $folder['name'] );
			if ( '' !== $folder['color'] ) {
				$node['color'] = $folder['color'];
			}
			if ( '' !== $folder['icon'] ) {
				$node['icon'] = $folder['icon'];
			}
			$children = self::nest( $flat, $pos, $depth + 1 );
			if ( $children ) {
				$node['children'] = $children;
			}
			$out[] = $node;
		}

		return $out;
	}

	/**
	 * Depth and folder count of a tree.
	 *
	 * @param array $nodes Nodes with optional `children`.
	 * @param int   $level Level of the nodes (top level = 1).
	 * @return array { depth: int, count: int }
	 */
	private static function measure( $nodes, $level = 1 ) {
		$depth = $nodes ? $level : 0;
		$count = 0;
		foreach ( $nodes as $node ) {
			$sub    = self::measure( isset( $node['children'] ) ? $node['children'] : array(), $level + 1 );
			$depth  = max( $depth, $sub['depth'] );
			$count += 1 + $sub['count'];
		}

		return array(
			'depth' => $depth,
			'count' => $count,
		);
	}

	/**
	 * Whether the current structure exceeds the import limits.
	 *
	 * @return bool
	 */
	public static function export_exceeds_limits() {
		$size = self::measure( self::export_tree() );

		return $size['depth'] > self::MAX_DEPTH || $size['count'] > self::MAX_FOLDERS;
	}

	/**
	 * Download of the folder structure.
	 */
	public static function handle_export() {
		self::authorize( 'fmm_export' );

		$data = array(
			'format'  => self::FORMAT,
			'version' => self::VERSION,
			'folders' => self::export_tree(),
		);

		nocache_headers();
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="fena-media-folders-' . wp_date( 'Y-m-d' ) . '.json"' );
		header( 'X-Content-Type-Options: nosniff' );
		echo wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON download.
		exit;
	}

	// ------------------------------------------------------------- validation.

	/**
	 * Validates a JSON document.
	 *
	 * @param string $json File content (without BOM).
	 * @return array { tree: array|null, errors: string[] }
	 */
	public static function parse( $json ) {
		$data = json_decode( $json, false, self::PARSER_DEPTH );

		if ( null === $data && JSON_ERROR_NONE !== json_last_error() ) {
			return self::failure(
				JSON_ERROR_DEPTH === json_last_error()
					? __( 'The file is nested too deeply or is not valid JSON.', 'fena-media-manager' )
					: __( 'The file is not valid JSON.', 'fena-media-manager' )
			);
		}

		if ( ! $data instanceof stdClass ) {
			return self::failure( __( 'The file must contain a JSON object.', 'fena-media-manager' ) );
		}

		$state = array(
			'errors' => array(),
			'more'   => false,
			'count'  => 0,
			'stop'   => false,
		);

		foreach ( array_keys( get_object_vars( $data ) ) as $key ) {
			if ( ! in_array( (string) $key, array( 'format', 'version', 'folders' ), true ) ) {
				self::add_error( $state, (string) $key, __( 'Unknown key.', 'fena-media-manager' ) );
			}
		}

		if ( ! isset( $data->format ) || self::FORMAT !== $data->format ) {
			/* translators: %s: format identifier. */
			self::add_error( $state, 'format', sprintf( __( 'Must be “%s”.', 'fena-media-manager' ), self::FORMAT ) );
		}
		if ( ! isset( $data->version ) || ! is_int( $data->version ) || self::VERSION !== $data->version ) {
			/* translators: %d: format version. */
			self::add_error( $state, 'version', sprintf( __( 'Must be the integer %d.', 'fena-media-manager' ), self::VERSION ) );
		}

		$tree = array();
		if ( ! isset( $data->folders ) || ! is_array( $data->folders ) || ! $data->folders ) {
			self::add_error( $state, 'folders', __( 'Must be a non-empty list of folders.', 'fena-media-manager' ) );
		} else {
			$tree = self::walk( $data->folders, 'folders', 1, $state );
		}

		if ( $state['errors'] ) {
			if ( $state['more'] ) {
				$state['errors'][] = __( '…and more errors.', 'fena-media-manager' );
			}

			return self::failure( $state['errors'] );
		}

		return array(
			'tree'   => $tree,
			'errors' => array(),
		);
	}

	/**
	 * Failure result.
	 *
	 * @param string|string[] $messages Message or messages.
	 * @return array
	 */
	private static function failure( $messages ) {
		return array(
			'tree'   => null,
			'errors' => (array) $messages,
		);
	}

	/**
	 * Records a validation error (capped).
	 *
	 * @param array  $state   Walker state.
	 * @param string $path    Path of the problem.
	 * @param string $message Short message.
	 */
	private static function add_error( &$state, $path, $message ) {
		if ( count( $state['errors'] ) >= self::MAX_ERRORS ) {
			$state['more'] = true;
			$state['stop'] = true;
			return;
		}

		$state['errors'][] = $path . ': ' . $message;
	}

	/**
	 * Validates a list of folders and returns the normalized nodes.
	 *
	 * @param array  $items Decoded list.
	 * @param string $path  Path of the list.
	 * @param int    $level Level of the folders (top level = 1).
	 * @param array  $state Walker state.
	 * @return array
	 */
	private static function walk( $items, $path, $level, &$state ) {
		$nodes = array();
		$seen  = array();

		foreach ( $items as $index => $item ) {
			if ( $state['stop'] ) {
				break;
			}

			$here = $path . '[' . $index . ']';

			if ( ++$state['count'] > self::MAX_FOLDERS ) {
				/* translators: %s: maximum number of folders. */
				self::add_error( $state, $here, sprintf( __( 'The file contains more than %s folders.', 'fena-media-manager' ), number_format_i18n( self::MAX_FOLDERS ) ) );
				$state['stop'] = true;
				break;
			}

			if ( $level > self::MAX_DEPTH ) {
				/* translators: %d: maximum depth. */
				self::add_error( $state, $here, sprintf( __( 'Folder hierarchy is deeper than %d levels.', 'fena-media-manager' ), self::MAX_DEPTH ) );
				continue;
			}

			if ( ! $item instanceof stdClass ) {
				self::add_error( $state, $here, __( 'Must be an object.', 'fena-media-manager' ) );
				continue;
			}

			foreach ( array_keys( get_object_vars( $item ) ) as $key ) {
				if ( ! in_array( (string) $key, array( 'name', 'color', 'icon', 'children' ), true ) ) {
					self::add_error( $state, $here . '.' . $key, __( 'Unknown key.', 'fena-media-manager' ) );
				}
			}

			$name = self::validate_name( $item, $here, $state );
			if ( null !== $name ) {
				$lower = FMM_Taxonomy::lower( $name );
				if ( isset( $seen[ $lower ] ) ) {
					self::add_error( $state, $here . '.name', __( 'Duplicate folder name among siblings.', 'fena-media-manager' ) );
				}
				$seen[ $lower ] = true;
			}

			$color = self::validate_color( $item, $here, $state );
			$icon  = self::validate_icon( $item, $here, $state );

			$children = array();
			if ( property_exists( $item, 'children' ) ) {
				if ( ! is_array( $item->children ) ) {
					self::add_error( $state, $here . '.children', __( 'Must be a list.', 'fena-media-manager' ) );
				} else {
					$children = self::walk( $item->children, $here . '.children', $level + 1, $state );
				}
			}

			$nodes[] = array(
				'name'     => (string) $name,
				'color'    => $color,
				'icon'     => $icon,
				'children' => $children,
			);
		}

		return $nodes;
	}

	/**
	 * Validates the name of a folder: WordPress must store and show it unchanged.
	 *
	 * @param stdClass $item  Folder object.
	 * @param string   $path  Path of the folder.
	 * @param array    $state Walker state.
	 * @return string|null Name, or null when invalid.
	 */
	private static function validate_name( $item, $path, &$state ) {
		$where = $path . '.name';

		if ( ! isset( $item->name ) ) {
			self::add_error( $state, $where, __( 'Required.', 'fena-media-manager' ) );
			return null;
		}

		$name = $item->name;

		if ( ! is_string( $name ) || '' === $name ) {
			self::add_error( $state, $where, __( 'Must be a non-empty string.', 'fena-media-manager' ) );
			return null;
		}

		if ( mb_strlen( $name ) > FMM_Taxonomy::MAX_NAME_LENGTH ) {
			/* translators: %d: maximum number of characters. */
			self::add_error( $state, $where, sprintf( __( 'Must not be longer than %d characters.', 'fena-media-manager' ), FMM_Taxonomy::MAX_NAME_LENGTH ) );
			return null;
		}

		if ( wp_specialchars_decode( sanitize_text_field( $name ), ENT_QUOTES ) !== $name ) {
			self::add_error( $state, $where, __( 'Contains HTML, line breaks, leading or trailing spaces or other characters WordPress would change.', 'fena-media-manager' ) );
			return null;
		}

		return $name;
	}

	/**
	 * Validates the optional icon of a folder.
	 *
	 * @param stdClass $item  Folder object.
	 * @param string   $path  Path of the folder.
	 * @param array    $state Walker state.
	 * @return string Icon key, or '' for the plain folder.
	 */
	private static function validate_icon( $item, $path, &$state ) {
		if ( ! property_exists( $item, 'icon' ) ) {
			return '';
		}

		if ( is_string( $item->icon ) && in_array( $item->icon, FMM_Taxonomy::ICONS, true ) ) {
			return $item->icon;
		}

		self::add_error( $state, $path . '.icon', __( 'Must be one of image, video, document, audio, archive, star, people or tag (omit it for the default folder).', 'fena-media-manager' ) );

		return '';
	}

	/**
	 * Validates the optional color of a folder.
	 *
	 * @param stdClass $item  Folder object.
	 * @param string   $path  Path of the folder.
	 * @param array    $state Walker state.
	 * @return string Preset, lowercase hex, or '' for none.
	 */
	private static function validate_color( $item, $path, &$state ) {
		if ( ! property_exists( $item, 'color' ) ) {
			return '';
		}

		$color = $item->color;

		if ( is_string( $color ) && ( in_array( $color, FMM_Taxonomy::COLOR_PRESETS, true ) || preg_match( '/^#[0-9a-f]{6}$/i', $color ) ) ) {
			return strtolower( $color );
		}

		self::add_error( $state, $path . '.color', __( 'Must be blue, violet, sand, green or a #rrggbb value (omit it for gray).', 'fena-media-manager' ) );

		return '';
	}

	/**
	 * Reads and validates an uploaded file.
	 *
	 * @param array|null $file Entry of $_FILES.
	 * @return array { tree: array|null, errors: string[], filename: string }
	 */
	public static function read_upload( $file ) {
		$fail = function ( $message ) {
			return array(
				'tree'     => null,
				'errors'   => array( $message ),
				'filename' => '',
			);
		};

		if ( ! is_array( $file ) || ! isset( $file['error'], $file['tmp_name'], $file['name'] ) || is_array( $file['error'] ) || UPLOAD_ERR_NO_FILE === $file['error'] ) {
			return $fail( __( 'Please choose a file.', 'fena-media-manager' ) );
		}

		if ( in_array( $file['error'], array( UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE ), true ) ) {
			return $fail( self::too_large() );
		}
		if ( UPLOAD_ERR_OK !== $file['error'] || ! is_uploaded_file( $file['tmp_name'] ) ) {
			return $fail( __( 'The file could not be uploaded.', 'fena-media-manager' ) );
		}

		$name = sanitize_file_name( wp_unslash( (string) $file['name'] ) );
		if ( 'json' !== strtolower( pathinfo( $name, PATHINFO_EXTENSION ) ) ) {
			return $fail( __( 'Please choose a .json file.', 'fena-media-manager' ) );
		}

		$size = filesize( $file['tmp_name'] );
		if ( $size > self::MAX_BYTES ) {
			return $fail( self::too_large() );
		}
		if ( ! $size ) {
			return $fail( __( 'The file is empty.', 'fena-media-manager' ) );
		}

		$json = file_get_contents( $file['tmp_name'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local temporary upload; never stored.
		if ( ! is_string( $json ) ) {
			return $fail( __( 'The file could not be read.', 'fena-media-manager' ) );
		}

		return self::parse_content( $json, $name );
	}

	/**
	 * Validates file content: BOM, encoding and structure.
	 *
	 * @param string $json File content.
	 * @param string $name File name for display.
	 * @return array { tree: array|null, errors: string[], filename: string }
	 */
	public static function parse_content( $json, $name = '' ) {
		if ( 0 === strpos( $json, "\xEF\xBB\xBF" ) ) {
			$json = substr( $json, 3 );
		}

		if ( 1 !== preg_match( '//u', $json ) ) {
			$result = self::failure( __( 'The file is not valid UTF-8.', 'fena-media-manager' ) );
		} else {
			$result = self::parse( $json );
		}

		$result['filename'] = $name;

		return $result;
	}

	/**
	 * Message for files above the size limit.
	 *
	 * @return string
	 */
	private static function too_large() {
		/* translators: %s: maximum file size, e.g. "512 KB". */
		return sprintf( __( 'The file is too large (maximum %s).', 'fena-media-manager' ), size_format( self::MAX_BYTES ) );
	}

	// ------------------------------------------------------------------- plan.

	/**
	 * Existing folders indexed for matching: effective parent => lowercase
	 * name => ID, and the next manual position per parent.
	 *
	 * @return array { kids: array, next: array }
	 */
	private static function existing() {
		$folders = FMM_Taxonomy::get_folders( 'manual' );
		$known   = array_flip( wp_list_pluck( $folders, 'id' ) );
		$kids    = array();
		$next    = array();

		foreach ( $folders as $folder ) {
			$parent = isset( $known[ $folder['parent'] ] ) ? $folder['parent'] : 0;
			$lower  = FMM_Taxonomy::lower( $folder['name'] );
			if ( ! isset( $kids[ $parent ][ $lower ] ) ) {
				$kids[ $parent ][ $lower ] = $folder['id'];
			}
			$next[ $parent ] = isset( $next[ $parent ] ) ? max( $next[ $parent ], $folder['order'] + 1 ) : $folder['order'] + 1;
		}

		return array(
			'kids' => $kids,
			'next' => $next,
		);
	}

	/**
	 * Plan of an import against the current folders. Status per node:
	 * new, merge (existing folder reused) or skip (whole subtree skipped).
	 *
	 * @param array  $nodes    Normalized nodes.
	 * @param string $strategy merge or skip.
	 * @param array  $existing Result of existing().
	 * @param int    $parent_id Existing parent folder ID (0 = top level).
	 * @param string $inherit  Status inherited from the parent ('' = none).
	 * @return array Nodes with status, id and planned children.
	 */
	private static function plan( $nodes, $strategy, $existing, $parent_id = 0, $inherit = '' ) {
		$out = array();

		foreach ( $nodes as $node ) {
			$id     = 0;
			$status = $inherit;
			if ( '' === $status ) {
				$lower = FMM_Taxonomy::lower( $node['name'] );
				if ( isset( $existing['kids'][ $parent_id ][ $lower ] ) ) {
					$id     = $existing['kids'][ $parent_id ][ $lower ];
					$status = 'merge' === $strategy ? 'merge' : 'skip';
				} else {
					$status = 'new';
				}
			}

			// Nothing is added below a locked folder.
			$locked = false;
			if ( 'new' === $status && $parent_id && FMM_Taxonomy::is_protected( $parent_id ) ) {
				$status = 'skip';
				$locked = true;
			}

			$planned             = $node;
			$planned['locked']   = $locked;
			$planned['status']   = $status;
			$planned['id']       = $id;
			$planned['children'] = self::plan( $node['children'], $strategy, $existing, $id, 'merge' === $status ? '' : $status );
			$out[]               = $planned;
		}

		return $out;
	}

	/**
	 * Counts planned nodes by status.
	 *
	 * @param array $plan Planned nodes.
	 * @return array { new: int, merge: int, skip: int }
	 */
	private static function tally( $plan ) {
		$counts = array(
			'new'   => 0,
			'merge' => 0,
			'skip'  => 0,
		);

		foreach ( $plan as $node ) {
			++$counts[ $node['status'] ];
			foreach ( self::tally( $node['children'] ) as $status => $number ) {
				$counts[ $status ] += $number;
			}
		}

		return $counts;
	}

	/**
	 * Number of folders in a list of nodes, including subfolders.
	 *
	 * @param array $nodes Nodes.
	 * @return int
	 */
	private static function count_nodes( $nodes ) {
		$size = self::measure( $nodes );

		return $size['count'];
	}

	// ------------------------------------------------------------------ import.

	/**
	 * Upload and validation. Writes nothing but the pending-import transient.
	 */
	public static function handle_preview() {
		self::authorize( 'fmm_import_preview' );

		$file   = isset( $_FILES['fmm_import_file'] ) ? $_FILES['fmm_import_file'] : null; // phpcs:ignore WordPress.Security.NonceVerification.Missing, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Nonce verified in authorize(); validated in read_upload().
		$result = self::read_upload( $file );

		if ( null === $result['tree'] ) {
			set_transient( self::key( 'errors' ), $result['errors'], 5 * MINUTE_IN_SECONDS );
			delete_transient( self::key( 'pending' ) );
			self::redirect( 'invalid' );
		}

		set_transient(
			self::key( 'pending' ),
			array(
				'token'    => wp_generate_password( 32, false ),
				'tree'     => $result['tree'],
				'filename' => $result['filename'],
				'time'     => time(),
			),
			self::TTL
		);

		self::redirect( 'preview' );
	}

	/**
	 * Discards the pending import.
	 */
	public static function handle_cancel() {
		self::authorize( 'fmm_import_cancel' );

		delete_transient( self::key( 'pending' ) );
		self::flash( 'info', __( 'Import cancelled. Nothing was changed.', 'fena-media-manager' ) );
		self::redirect( 'done' );
	}

	/**
	 * Runs the pending import after confirmation.
	 */
	public static function handle_confirm() {
		self::authorize( 'fmm_import_confirm' );

		$pending  = get_transient( self::key( 'pending' ) );
		$token    = isset( $_POST['fmm_token'] ) ? sanitize_text_field( wp_unslash( $_POST['fmm_token'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Verified in authorize().
		$strategy = isset( $_POST['fmm_strategy'] ) ? sanitize_key( wp_unslash( $_POST['fmm_strategy'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Verified in authorize().

		if ( ! is_array( $pending ) || empty( $pending['token'] ) || '' === $token || ! hash_equals( (string) $pending['token'], $token ) || ! in_array( $strategy, array( 'merge', 'skip' ), true ) ) {
			self::flash( 'error', __( 'The import has expired or is invalid. Nothing was changed. Please check the file again.', 'fena-media-manager' ) );
			self::redirect( 'done' );
		}

		// A dropped connection (proxy or FastCGI timeout) must not stop the import halfway.
		ignore_user_abort( true );

		// Busy: keep the checked file, the user can press "Import folders" again.
		if ( ! self::acquire_lock() ) {
			self::flash( 'warning', __( 'Another import is running. Your checked file is kept – you can start the import again in a moment.', 'fena-media-manager' ) );
			self::redirect( 'preview' );
		}

		$summary = null;
		try {
			// Another request may have used the import while we waited for the lock.
			$pending = get_transient( self::key( 'pending' ) );
			if ( is_array( $pending ) && ! empty( $pending['token'] ) && hash_equals( (string) $pending['token'], $token ) ) {
				// Single use.
				delete_transient( self::key( 'pending' ) );
				$summary = self::apply( $pending['tree'], $strategy );
			}
		} finally {
			delete_option( self::LOCK );
		}

		if ( null === $summary ) {
			self::flash( 'error', __( 'The import has expired or is invalid. Nothing was changed. Please check the file again.', 'fena-media-manager' ) );
			self::redirect( 'done' );
		}

		self::report( $summary, $strategy );
		self::redirect( 'done' );
	}

	/**
	 * Takes the import lock atomically: INSERT IGNORE succeeds for exactly
	 * one request (add_option() is not atomic: its upsert reports success
	 * when the stored timestamp differs). A stale lock is taken over with a
	 * compare-and-swap on its old value.
	 *
	 * @return bool
	 */
	private static function acquire_lock() {
		global $wpdb;

		for ( $attempt = 0; $attempt < 2; $attempt++ ) {
			$now = (string) time();

			$inserted = $wpdb->query( $wpdb->prepare( "INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, 'no')", self::LOCK, $now ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic lock.
			if ( $inserted ) {
				self::forget_lock_cache();
				return true;
			}

			$held = $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", self::LOCK ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic lock.
			if ( null === $held ) {
				continue;
			}
			if ( time() - (int) $held <= self::LOCK_TTL ) {
				break;
			}

			$won = $wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND option_value = %s", $now, self::LOCK, $held ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic lock.
			self::forget_lock_cache();

			return (bool) $won;
		}

		return false;
	}

	/**
	 * Drops cached copies of the lock option after direct writes.
	 */
	private static function forget_lock_cache() {
		wp_cache_delete( self::LOCK, 'options' );
		wp_cache_delete( 'notoptions', 'options' );
		wp_cache_delete( 'alloptions', 'options' );
	}

	/**
	 * Creates the missing folders (parents before children) and counts
	 * exactly what happened. Existing folders, relationships and media are
	 * never touched.
	 *
	 * @param array  $tree     Normalized nodes.
	 * @param string $strategy merge or skip.
	 * @return array Counters and failure lines.
	 */
	public static function apply( $tree, $strategy ) {
		if ( function_exists( 'set_time_limit' ) ) {
			set_time_limit( 300 ); // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged -- Large imports need more than the default limit.
		}
		wp_raise_memory_limit( 'admin' );

		$summary = array(
			'created'      => 0,
			'merged'       => 0,
			'skipped'      => 0,
			'failed'       => 0,
			'blocked'      => 0,
			'meta_failed'  => 0,
			'failure_list' => array(),
			'more'         => 0,
			'ids'          => array(),
		);
		$index   = self::existing();

		/*
		 * Importer mode: without it every inserted term clears the term cache
		 * and rebuilds the folder hierarchy from all folders (quadratic for
		 * big imports). The cache is cleared once at the end.
		 */
		$suspended = wp_suspend_cache_invalidation( true );
		try {
			self::apply_nodes( $tree, 0, 'folders', $strategy, $index, $summary );
		} finally {
			wp_suspend_cache_invalidation( $suspended );
			if ( $summary['ids'] ) {
				clean_term_cache( $summary['ids'], FMM_Taxonomy::NAME );
			}
		}

		return $summary;
	}

	/**
	 * Records a failure line (capped).
	 *
	 * @param array  $summary Summary.
	 * @param string $path    Path of the folder.
	 * @param string $message Message.
	 */
	private static function note_failure( &$summary, $path, $message ) {
		if ( count( $summary['failure_list'] ) < self::MAX_ERRORS ) {
			$summary['failure_list'][] = $path . ': ' . $message;
		} else {
			++$summary['more'];
		}
	}

	/**
	 * Applies a list of nodes below a parent folder. Every created folder
	 * (term and position/color/icon meta) is written in one transaction, so an
	 * interrupted request leaves no folder without its position. This needs
	 * InnoDB (the WordPress default); on MyISAM the old small window remains.
	 *
	 * @param array  $nodes    Nodes.
	 * @param int    $parent_id Parent folder ID (0 = top level).
	 * @param string $path     Path of the list.
	 * @param string $strategy merge or skip.
	 * @param array  $index    In-memory folder index (updated).
	 * @param array  $summary  Summary (updated).
	 */
	private static function apply_nodes( $nodes, $parent_id, $path, $strategy, &$index, &$summary ) {
		global $wpdb;

		foreach ( $nodes as $position => $node ) {
			$here  = $path . '[' . $position . ']';
			$lower = FMM_Taxonomy::lower( $node['name'] );
			$id    = isset( $index['kids'][ $parent_id ][ $lower ] ) ? $index['kids'][ $parent_id ][ $lower ] : 0;

			if ( ! $id && $parent_id && FMM_Taxonomy::is_protected( $parent_id ) ) {
				// Re-checked here: the plan may be older than the request.
				$summary['skipped'] += 1 + self::count_nodes( $node['children'] );
				self::note_failure( $summary, $here, __( 'Not created: the parent folder is locked.', 'fena-media-manager' ) );
				continue;
			}

			if ( ! $id ) {
				// One transaction per folder: if the request dies between the insert and the meta writes, MySQL rolls the folder back.
				$wpdb->query( 'START TRANSACTION' ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Transaction control.
				$created = wp_insert_term( $node['name'], FMM_Taxonomy::NAME, array( 'parent' => $parent_id ) );

				if ( is_wp_error( $created ) ) {
					$wpdb->query( 'ROLLBACK' ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Transaction control.
					if ( 'term_exists' !== $created->get_error_code() || (int) $created->get_error_data() <= 0 ) {
						++$summary['failed'];
						$summary['blocked'] += self::count_nodes( $node['children'] );
						self::note_failure( $summary, $here, $created->get_error_message() );
						continue;
					}

					// Created by someone else in the meantime: treat as existing.
					$id = (int) $created->get_error_data();
				} else {
					$id = (int) $created['term_id'];
					++$summary['created'];
					$summary['ids'][] = $id;

					$order                       = isset( $index['next'][ $parent_id ] ) ? $index['next'][ $parent_id ] : 0;
					$index['next'][ $parent_id ] = $order + 1;

					if ( ! update_term_meta( $id, FMM_Taxonomy::ORDER_META, $order ) ) {
						++$summary['meta_failed'];
						self::note_failure( $summary, $here, __( 'The folder was created, but its position could not be saved.', 'fena-media-manager' ) );
					}
					if ( ( '' !== $node['color'] && ! update_term_meta( $id, FMM_Taxonomy::COLOR_META, $node['color'] ) ) || ( '' !== $node['icon'] && ! update_term_meta( $id, FMM_Taxonomy::ICON_META, $node['icon'] ) ) ) {
						++$summary['meta_failed'];
						self::note_failure( $summary, $here, __( 'The folder was created, but its color or icon could not be saved.', 'fena-media-manager' ) );
					}
					$wpdb->query( 'COMMIT' ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Transaction control.

					$index['kids'][ $parent_id ][ $lower ] = $id;
					self::apply_nodes( $node['children'], $id, $here . '.children', $strategy, $index, $summary );
					continue;
				}

				$index['kids'][ $parent_id ][ $lower ] = $id;
			}

			// Existing folder.
			if ( 'skip' === $strategy ) {
				$summary['skipped'] += 1 + self::count_nodes( $node['children'] );
				continue;
			}

			++$summary['merged'];
			self::apply_nodes( $node['children'], $id, $here . '.children', $strategy, $index, $summary );
		}
	}

	/**
	 * Builds and stores the result notice.
	 *
	 * @param array  $s        Summary from apply().
	 * @param string $strategy merge or skip.
	 */
	private static function report( $s, $strategy ) {
		$failed = $s['failed'];
		$meta   = $s['meta_failed'];
		$lines  = $s['failure_list'];
		if ( $s['more'] ) {
			$lines[] = __( '…and more failures.', 'fena-media-manager' );
		}

		/* translators: %d: number of folders. */
		$created = sprintf( _n( '%d folder created', '%d folders created', $s['created'], 'fena-media-manager' ), $s['created'] );
		/* translators: %d: number of folders. */
		$merged = sprintf( _n( '%d existing folder reused', '%d existing folders reused', $s['merged'], 'fena-media-manager' ), $s['merged'] );
		/* translators: %d: number of folders. */
		$skipped = sprintf( _n( '%d folder skipped', '%d folders skipped', $s['skipped'], 'fena-media-manager' ), $s['skipped'] );

		if ( 0 === $failed && 0 === $meta && 0 === $s['created'] ) {
			if ( 'skip' === $strategy ) {
				/* translators: %d: number of folders. */
				$message = sprintf( _n( 'Nothing new to import. %d folder was skipped.', 'Nothing new to import. %d folders were skipped.', $s['skipped'], 'fena-media-manager' ), $s['skipped'] );
			} else {
				/* translators: %d: number of folders. */
				$message = sprintf( _n( 'Nothing new to import. %d folder already existed.', 'Nothing new to import. %d folders already existed.', $s['merged'], 'fena-media-manager' ), $s['merged'] );
			}
			self::flash( 'info', $message );
			return;
		}

		if ( 0 === $failed && 0 === $meta ) {
			/* translators: 1: folders created, 2: existing folders reused, 3: folders skipped. */
			self::flash( 'success', sprintf( __( 'Import completed: %1$s, %2$s, %3$s.', 'fena-media-manager' ), $created, $merged, $skipped ) );
			return;
		}

		$problems = array();
		if ( $failed > 0 ) {
			/* translators: %d: number of folders. */
			$failed_text = sprintf( _n( '%d folder failed', '%d folders failed', $failed, 'fena-media-manager' ), $failed );
			/* translators: %d: number of folders. */
			$blocked_text = sprintf( _n( '%d folder not created because its parent failed', '%d folders not created because their parent failed', $s['blocked'], 'fena-media-manager' ), $s['blocked'] );
			/* translators: 1: folders that failed, 2: folders not created because a parent failed. */
			$problems[] = sprintf( __( 'Not imported: %1$s, %2$s.', 'fena-media-manager' ), $failed_text, $blocked_text );
		}
		if ( $meta > 0 ) {
			/* translators: %d: number of folders. */
			$problems[] = sprintf( _n( '%d folder was created, but its color, icon or position could not be saved.', '%d folders were created, but their color, icon or position could not be saved.', $meta, 'fena-media-manager' ), $meta );
		}
		$problem_text = implode( ' ', $problems );

		if ( 0 === $s['created'] + $s['merged'] && $failed > 0 ) {
			/* translators: %s: failure summary. */
			self::flash( 'error', sprintf( __( 'Import failed: nothing was imported. %s', 'fena-media-manager' ), $problem_text ), $lines );
			return;
		}

		/* translators: 1: folders created, 2: existing folders reused, 3: folders skipped, 4: problem summary. */
		self::flash( 'warning', sprintf( __( 'Import partially completed: %1$s, %2$s, %3$s. %4$s', 'fena-media-manager' ), $created, $merged, $skipped, $problem_text ), $lines );
	}

	// --------------------------------------------------------------- rendering.

	/**
	 * Renders the Import / Export section of the settings page.
	 */
	public static function render_section() {
		$state = isset( $_GET['fmm_import'] ) ? sanitize_key( wp_unslash( $_GET['fmm_import'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Display only.
		$admin = admin_url( 'admin-post.php' );
		?>
		<section class="fmm-card fmm-transfer" aria-labelledby="fmm-settings-transfer">
			<h2 id="fmm-settings-transfer"><?php esc_html_e( 'Import / Export', 'fena-media-manager' ); ?></h2>

			<?php self::render_notices( $state ); ?>

			<div class="fmm-field">
				<div class="fmm-field__label"><?php esc_html_e( 'Export', 'fena-media-manager' ); ?></div>
				<div class="fmm-field__control">
					<form method="post" action="<?php echo esc_url( $admin ); ?>">
						<input type="hidden" name="action" value="fmm_export" />
						<?php wp_nonce_field( 'fmm_export' ); ?>
						<p class="fmm-field__help" id="fmm-export-help"><?php esc_html_e( 'Downloads the folder structure (names, colors, icons, hierarchy and manual order) as a JSON file. Media files, assignments and settings are not exported.', 'fena-media-manager' ); ?></p>
						<button type="submit" class="button" aria-describedby="fmm-export-help"><?php esc_html_e( 'Export folders', 'fena-media-manager' ); ?></button>
					</form>
					<?php if ( self::export_exceeds_limits() ) : ?>
						<p class="fmm-field__warning">
							<?php
							printf(
								/* translators: 1: maximum folders, 2: maximum levels. */
								esc_html__( 'Your folder structure is larger than the import limits (%1$s folders, %2$d levels). The export works, but importing the file will be rejected.', 'fena-media-manager' ),
								esc_html( number_format_i18n( self::MAX_FOLDERS ) ),
								(int) self::MAX_DEPTH
							);
							?>
						</p>
					<?php endif; ?>
				</div>
			</div>

			<div class="fmm-field">
				<div class="fmm-field__label"><label for="fmm-import-file"><?php esc_html_e( 'Folder structure file (.json)', 'fena-media-manager' ); ?></label></div>
				<div class="fmm-field__control">
					<form method="post" action="<?php echo esc_url( $admin ); ?>" enctype="multipart/form-data">
						<input type="hidden" name="action" value="fmm_import_preview" />
						<?php wp_nonce_field( 'fmm_import_preview' ); ?>
						<input type="file" id="fmm-import-file" name="fmm_import_file" accept=".json,application/json" aria-describedby="fmm-import-help" required />
						<p class="fmm-field__help" id="fmm-import-help">
							<?php
							printf(
								/* translators: 1: maximum file size, 2: maximum folders, 3: maximum levels. */
								esc_html__( 'Maximum %1$s, %2$s folders, %3$d levels. Media files and media assignments are not transferred. Existing folders are not changed. You can review the result before anything is imported.', 'fena-media-manager' ),
								esc_html( size_format( self::MAX_BYTES ) ),
								esc_html( number_format_i18n( self::MAX_FOLDERS ) ),
								(int) self::MAX_DEPTH
							);
							?>
						</p>
						<button type="submit" class="button"><?php esc_html_e( 'Check file', 'fena-media-manager' ); ?></button>
					</form>
				</div>
			</div>

			<?php
			if ( 'preview' === $state ) {
				self::render_preview();
			}
			?>
		</section>
		<?php
	}

	/**
	 * Renders the one-time notices (errors, results).
	 *
	 * @param string $state Value of the fmm_import query argument.
	 */
	private static function render_notices( $state ) {
		if ( 'invalid' === $state ) {
			$errors = get_transient( self::key( 'errors' ) );
			delete_transient( self::key( 'errors' ) );
			if ( is_array( $errors ) && $errors ) {
				?>
				<div class="notice notice-error inline fmm-notice" role="alert">
					<p><strong><?php esc_html_e( 'The file cannot be imported. Nothing was changed.', 'fena-media-manager' ); ?></strong></p>
					<ul>
						<?php foreach ( $errors as $error ) : ?>
							<li><?php echo esc_html( $error ); ?></li>
						<?php endforeach; ?>
					</ul>
				</div>
				<?php
			}
		}

		// Also shown without the query argument, so a lost redirect does not hide the result.
		$result = get_transient( self::key( 'result' ) );
		delete_transient( self::key( 'result' ) );
		if ( is_array( $result ) && isset( $result['type'], $result['message'] ) ) {
			$type = in_array( $result['type'], array( 'success', 'warning', 'error', 'info' ), true ) ? $result['type'] : 'info';
			?>
			<div class="notice notice-<?php echo esc_attr( $type ); ?> inline fmm-notice" role="<?php echo esc_attr( in_array( $type, array( 'error', 'warning' ), true ) ? 'alert' : 'status' ); ?>">
				<p><?php echo esc_html( $result['message'] ); ?></p>
				<?php if ( ! empty( $result['lines'] ) ) : ?>
					<ul>
						<?php foreach ( (array) $result['lines'] as $line ) : ?>
							<li><?php echo esc_html( $line ); ?></li>
						<?php endforeach; ?>
					</ul>
				<?php endif; ?>
			</div>
			<?php
		} else {
			$lock = get_option( self::LOCK );
			if ( false !== $lock && time() - (int) $lock <= self::LOCK_TTL ) {
				?>
				<div class="notice notice-info inline fmm-notice" role="status"><p><?php esc_html_e( 'An import is currently running. Reload this page in a moment to see the result.', 'fena-media-manager' ); ?></p></div>
				<?php
			}
		}
	}

	/**
	 * "N new folder(s)" for the preview summary.
	 *
	 * @param int $n Count.
	 * @return string
	 */
	private static function new_text( $n ) {
		/* translators: %d: number of folders. */
		return sprintf( _n( '%d new folder', '%d new folders', $n, 'fena-media-manager' ), $n );
	}

	/**
	 * "N existing folder(s) reused" for the preview summary.
	 *
	 * @param int $n Count.
	 * @return string
	 */
	private static function reused_text( $n ) {
		/* translators: %d: number of folders. */
		return sprintf( _n( '%d existing folder reused', '%d existing folders reused', $n, 'fena-media-manager' ), $n );
	}

	/**
	 * "N skipped including subfolders" for the preview summary.
	 *
	 * @param int $n Count.
	 * @return string
	 */
	private static function skipped_text( $n ) {
		/* translators: %d: number of folders. */
		return sprintf( _n( '%d folder skipped including subfolders', '%d folders skipped including subfolders', $n, 'fena-media-manager' ), $n );
	}

	/**
	 * Renders the preview of the pending import.
	 */
	private static function render_preview() {
		$pending = get_transient( self::key( 'pending' ) );

		if ( ! is_array( $pending ) || empty( $pending['tree'] ) ) {
			?>
			<div class="notice notice-warning inline fmm-notice" role="alert"><p><?php esc_html_e( 'The import preview has expired. Please check the file again.', 'fena-media-manager' ); ?></p></div>
			<?php
			return;
		}

		$existing = self::existing();
		$merge    = self::plan( $pending['tree'], 'merge', $existing );
		$skip     = self::plan( $pending['tree'], 'skip', $existing );
		$tm       = self::tally( $merge );
		$ts       = self::tally( $skip );
		$admin    = admin_url( 'admin-post.php' );
		?>
		<div class="fmm-preview" data-strategy="merge">
			<h3 id="fmm-preview-title">
				<?php
				/* translators: %s: file name. */
				echo esc_html( sprintf( __( 'Preview: %s', 'fena-media-manager' ), $pending['filename'] ) );
				?>
			</h3>
			<p class="fmm-preview__summary">
				<strong><?php esc_html_e( 'Merge:', 'fena-media-manager' ); ?></strong>
				<?php echo esc_html( self::new_text( $tm['new'] ) . ', ' . self::reused_text( $tm['merge'] ) ); ?>
			</p>
			<p class="fmm-preview__summary">
				<strong><?php esc_html_e( 'Skip:', 'fena-media-manager' ); ?></strong>
				<?php echo esc_html( self::new_text( $ts['new'] ) . ', ' . self::skipped_text( $ts['skip'] ) ); ?>
			</p>
			<p class="fmm-field__help"><?php esc_html_e( 'Media files and media assignments are not transferred. Existing folders are not changed or deleted.', 'fena-media-manager' ); ?></p>

			<ul class="fmm-legend" aria-label="<?php esc_attr_e( 'Legend', 'fena-media-manager' ); ?>">
				<li><span class="fmm-badge fmm-badge--new"><?php esc_html_e( 'New', 'fena-media-manager' ); ?></span> <?php esc_html_e( 'The folder will be created.', 'fena-media-manager' ); ?></li>
				<li><span class="fmm-badge fmm-badge--merge"><?php esc_html_e( 'Already exists – will be merged', 'fena-media-manager' ); ?></span> <?php esc_html_e( 'The existing folder is reused; only missing subfolders are added.', 'fena-media-manager' ); ?></li>
				<li><span class="fmm-badge fmm-badge--skip"><?php esc_html_e( 'Skipped', 'fena-media-manager' ); ?></span> <?php esc_html_e( 'Nothing is created for this folder and its subfolders.', 'fena-media-manager' ); ?></li>
			</ul>

			<div class="fmm-preview__actions">
				<form method="post" action="<?php echo esc_url( $admin ); ?>">
					<input type="hidden" name="action" value="fmm_import_confirm" />
					<input type="hidden" name="fmm_token" value="<?php echo esc_attr( $pending['token'] ); ?>" />
					<?php wp_nonce_field( 'fmm_import_confirm' ); ?>
					<fieldset class="fmm-preview__strategy">
						<legend><?php esc_html_e( 'If a folder already exists', 'fena-media-manager' ); ?></legend>
						<label class="fmm-choice"><input type="radio" name="fmm_strategy" value="merge" checked="checked" /> <?php esc_html_e( 'Merge: reuse it and add missing subfolders', 'fena-media-manager' ); ?></label>
						<label class="fmm-choice"><input type="radio" name="fmm_strategy" value="skip" /> <?php esc_html_e( 'Skip: leave it and its subfolders out', 'fena-media-manager' ); ?></label>
					</fieldset>
					<noscript><p class="fmm-field__help"><?php esc_html_e( 'The statuses below show the merge result; the skip result is calculated when you import.', 'fena-media-manager' ); ?></p></noscript>
					<button type="submit" class="button button-primary"><?php esc_html_e( 'Import folders', 'fena-media-manager' ); ?></button>
				</form>
				<form method="post" action="<?php echo esc_url( $admin ); ?>">
					<input type="hidden" name="action" value="fmm_import_cancel" />
					<?php wp_nonce_field( 'fmm_import_cancel' ); ?>
					<button type="submit" class="button"><?php esc_html_e( 'Cancel', 'fena-media-manager' ); ?></button>
				</form>
			</div>

			<div role="region" aria-labelledby="fmm-preview-title" class="fmm-preview__tree" tabindex="0">
				<?php self::render_plan( $merge, $skip ); ?>
			</div>
		</div>
		<?php
	}

	/**
	 * Translated name of a folder icon.
	 *
	 * @param string $key Icon key.
	 * @return string Name.
	 */
	private static function icon_label( $key ) {
		$labels = array(
			'image'    => __( 'Image', 'fena-media-manager' ),
			'video'    => __( 'Video', 'fena-media-manager' ),
			'document' => __( 'Document', 'fena-media-manager' ),
			'audio'    => __( 'Audio', 'fena-media-manager' ),
			'archive'  => __( 'Archive', 'fena-media-manager' ),
			'star'     => __( 'Star', 'fena-media-manager' ),
			'people'   => __( 'People', 'fena-media-manager' ),
			'tag'      => __( 'Tag', 'fena-media-manager' ),
		);

		return isset( $labels[ $key ] ) ? $labels[ $key ] : $key;
	}

	/**
	 * Renders the planned tree with the statuses of both strategies.
	 *
	 * @param array $merge Plan with the merge strategy.
	 * @param array $skip  Plan with the skip strategy (same structure).
	 */
	private static function render_plan( $merge, $skip ) {
		$labels = array(
			'new'   => __( 'New', 'fena-media-manager' ),
			'merge' => __( 'Already exists – will be merged', 'fena-media-manager' ),
			'skip'  => __( 'Skipped', 'fena-media-manager' ),
		);

		echo '<ul class="fmm-tree">';
		foreach ( $merge as $i => $node ) {
			$other = $skip[ $i ];
			echo '<li><span class="fmm-tree__row">';
			if ( preg_match( '/^#[0-9a-f]{6}$/', $node['color'] ) ) {
				echo '<span class="fmm-swatch" aria-hidden="true" style="--fmm-folder-color:' . esc_attr( $node['color'] ) . '"></span>';
			} else {
				echo '<span class="fmm-swatch" aria-hidden="true"' . ( '' !== $node['color'] ? ' data-fmm-color="' . esc_attr( $node['color'] ) . '"' : '' ) . '></span>';
			}
			echo '<span class="fmm-tree__name">' . esc_html( $node['name'] ) . '</span> ';
			if ( '' !== $node['icon'] ) {
				echo '<span class="fmm-tree__icon">· ' . esc_html( self::icon_label( $node['icon'] ) ) . '</span> ';
			}
			echo '<span class="fmm-badge fmm-badge--' . esc_attr( $node['status'] ) . '" data-view="merge">' . esc_html( $labels[ $node['status'] ] ) . '</span>';
			echo '<span class="fmm-badge fmm-badge--' . esc_attr( $other['status'] ) . '" data-view="skip" hidden>' . esc_html( $labels[ $other['status'] ] ) . '</span>';
			if ( ! empty( $node['locked'] ) ) {
				echo ' <span class="fmm-tree__icon">' . esc_html__( '· Locked folder: nothing is added below it.', 'fena-media-manager' ) . '</span>';
			}
			echo '</span>';
			if ( $node['children'] ) {
				self::render_plan( $node['children'], $other['children'] );
			}
			echo '</li>';
		}
		echo '</ul>';
	}
}
