<?php
/**
 * REST endpoints for folder management and assignment.
 *
 * @package Fena_Media_Manager
 */

defined( 'ABSPATH' ) || exit;

/**
 * Routes in the fmm/v1 namespace. Every route checks capabilities server-side.
 */
class FMM_REST {

	/**
	 * REST namespace.
	 */
	const NAMESPACE_V1 = 'fmm/v1';

	/**
	 * Registers the routes.
	 */
	public static function register_routes() {
		$name_arg = array(
			'name' => array(
				'type'     => 'string',
				'required' => true,
			),
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/folders',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'get_folders' ),
					'permission_callback' => array( 'FMM_Taxonomy', 'can_read' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, 'create_folder' ),
					'permission_callback' => array( 'FMM_Taxonomy', 'can_manage' ),
					'args'                => array_merge(
						$name_arg,
						array(
							'parent' => array(
								'type'    => 'integer',
								'minimum' => 0,
								'default' => 0,
							),
						)
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/summary',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_summary' ),
				'permission_callback' => array( 'FMM_Taxonomy', 'can_read' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/folders/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( __CLASS__, 'update_folder' ),
					'permission_callback' => array( 'FMM_Taxonomy', 'can_manage' ),
					'args'                => array(
						'name'   => array( 'type' => 'string' ),
						'parent' => array(
							'type'    => 'integer',
							'minimum' => 0,
						),
						'color'  => array( 'type' => 'string' ),
						'icon'   => array( 'type' => 'string' ),
						'locked' => array( 'type' => 'boolean' ),
					),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( __CLASS__, 'delete_folder' ),
					'permission_callback' => array( 'FMM_Taxonomy', 'can_manage' ),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/folders/order',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'reorder_folders' ),
				'permission_callback' => array( 'FMM_Taxonomy', 'can_manage' ),
				'args'                => array(
					'parent' => array(
						'type'    => 'integer',
						'minimum' => 0,
						'default' => 0,
					),
					'ids'    => array(
						'type'     => 'array',
						'required' => true,
						'minItems' => 1,
						'maxItems' => 2000,
						'items'    => array(
							'type'    => 'integer',
							'minimum' => 1,
						),
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/preferences',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'set_preferences' ),
				'permission_callback' => array( 'FMM_Taxonomy', 'can_read' ),
				'args'                => array(
					'sort' => array(
						'type'     => 'string',
						'required' => true,
						'enum'     => FMM_Taxonomy::SORT_MODES,
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/assign',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'assign' ),
				'permission_callback' => array( 'FMM_Taxonomy', 'can_assign_any' ),
				'args'                => array(
					'attachment_ids' => array(
						'type'     => 'array',
						'required' => true,
						'minItems' => 1,
						'maxItems' => 500,
						'items'    => array(
							'type'    => 'integer',
							'minimum' => 1,
						),
					),
					'folder_ids'     => array(
						'type'     => 'array',
						'required' => true,
						'minItems' => 1,
						'maxItems' => 100,
						'items'    => array(
							'type'    => 'integer',
							'minimum' => 1,
						),
					),
					'mode'           => array(
						'type'     => 'string',
						'required' => true,
						'enum'     => array( 'add', 'remove', 'move' ),
					),
					'source_folder'  => array(
						'type'    => 'integer',
						'minimum' => 1,
					),
				),
			)
		);
	}

	/**
	 * GET /folders.
	 *
	 * @return WP_REST_Response
	 */
	public static function get_folders() {
		return rest_ensure_response( FMM_Taxonomy::get_folders() );
	}

	/**
	 * GET /summary: folders plus "All Media" and "Unassigned" counts.
	 *
	 * @return WP_REST_Response
	 */
	public static function get_summary() {
		return rest_ensure_response( FMM_Library::get_summary() );
	}

	/**
	 * POST /folders. An optional `parent` creates a subfolder.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function create_folder( WP_REST_Request $request ) {
		$name  = FMM_Taxonomy::sanitize_name( $request['name'] );
		$valid = FMM_Taxonomy::validate_name( $name );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}

		$parent = (int) $request['parent'];
		if ( $parent && ! FMM_Taxonomy::get_folder( $parent ) ) {
			return self::not_found();
		}
		if ( FMM_Taxonomy::is_protected( $parent ) ) {
			return self::locked_error( __( 'A locked folder cannot receive folders.', 'fena-media-manager' ) );
		}
		if ( FMM_Taxonomy::name_exists( $name, $parent ) ) {
			return self::term_error( new WP_Error( 'term_exists' ) );
		}

		$order  = FMM_Taxonomy::next_order( $parent );
		$result = wp_insert_term( $name, FMM_Taxonomy::NAME, array( 'parent' => $parent ) );
		if ( is_wp_error( $result ) ) {
			return self::term_error( $result );
		}
		update_term_meta( $result['term_id'], FMM_Taxonomy::ORDER_META, $order );

		$response = rest_ensure_response( FMM_Taxonomy::prepare_folder( FMM_Taxonomy::get_folder( $result['term_id'] ) ) );
		$response->set_status( 201 );

		return $response;
	}

	/**
	 * POST /folders/order. Stores the manual order of the folders below `parent`.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function reorder_folders( WP_REST_Request $request ) {
		$parent = (int) $request['parent'];
		if ( $parent && ! FMM_Taxonomy::get_folder( $parent ) ) {
			return self::not_found();
		}

		if ( FMM_Taxonomy::is_protected( $parent ) ) {
			return self::locked_error( __( 'The folders inside a locked folder cannot be reordered.', 'fena-media-manager' ) );
		}

		// A locked folder keeps its position among its siblings.
		$ids     = array_map( 'intval', (array) $request['ids'] );
		$current = FMM_Taxonomy::child_ids( $parent, FMM_Taxonomy::get_folders( 'manual' ) );
		foreach ( array_intersect( $current, FMM_Taxonomy::locked_ids() ) as $index => $locked_id ) {
			if ( in_array( $locked_id, $ids, true ) && array_search( $locked_id, $ids, true ) !== $index ) {
				return self::locked_error( __( 'A locked folder keeps its position; the order cannot be changed here.', 'fena-media-manager' ) );
			}
		}

		$result = FMM_Taxonomy::reorder( $parent, $request['ids'] );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return rest_ensure_response( FMM_Library::get_summary() );
	}

	/**
	 * POST /preferences. Saves the folder sort mode of the current user.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function set_preferences( WP_REST_Request $request ) {
		FMM_Taxonomy::set_sort_mode( $request['sort'] );

		return rest_ensure_response( FMM_Library::get_summary() );
	}

	/**
	 * PATCH /folders/<id>. Renames, moves, recolors, sets the icon of and/or
	 * locks or unlocks a folder (`locked`: boolean; rename and move are checked
	 * against the lock state before the request; `color`: preset key, #rrggbb, or ''/'gray' to reset; `icon`: a key
	 * of FMM_Taxonomy::ICONS, or ''/'folder' to reset); the slug stays stable; media assignments are untouched because the term_taxonomy_id
	 * does not change. A moved folder goes to the end of its new level and
	 * takes its subfolders along.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function update_folder( WP_REST_Request $request ) {
		$folder = FMM_Taxonomy::get_folder( $request['id'] );
		if ( ! $folder ) {
			return self::not_found();
		}

		if ( ! $request->has_param( 'name' ) && ! $request->has_param( 'parent' ) && ! $request->has_param( 'color' ) && ! $request->has_param( 'icon' ) && ! $request->has_param( 'locked' ) ) {
			return new WP_Error( 'fmm_nothing_to_update', __( 'Nothing to update.', 'fena-media-manager' ), array( 'status' => 400 ) );
		}

		$args   = array();
		$name   = wp_specialchars_decode( $folder->name, ENT_QUOTES );
		$parent = (int) $folder->parent;
		$moved  = false;

		if ( $request->has_param( 'name' ) ) {
			$name  = FMM_Taxonomy::sanitize_name( $request['name'] );
			$valid = FMM_Taxonomy::validate_name( $name );
			if ( is_wp_error( $valid ) ) {
				return $valid;
			}
			$args['name'] = $name;
		}

		if ( $request->has_param( 'parent' ) ) {
			$target = (int) $request['parent'];
			if ( $target && ! FMM_Taxonomy::get_folder( $target ) ) {
				return self::not_found();
			}
			if ( ! FMM_Taxonomy::is_valid_parent( $folder->term_id, $target ) ) {
				return new WP_Error( 'fmm_invalid_parent', __( 'A folder cannot be moved into itself or one of its subfolders.', 'fena-media-manager' ), array( 'status' => 400 ) );
			}
			if ( $target !== $parent ) {
				$parent         = $target;
				$moved          = true;
				$args['parent'] = $target;
			}
		}

		// A locked folder (or one inside a locked folder) keeps name and place; a move must not drag a locked folder along or into one.
		$protected = FMM_Taxonomy::is_protected( $folder->term_id );
		if ( $protected && ( ( isset( $args['name'] ) && wp_specialchars_decode( $folder->name, ENT_QUOTES ) !== $args['name'] ) || $moved ) ) {
			return self::locked_error( __( 'A locked folder cannot be renamed or moved.', 'fena-media-manager' ) );
		}
		if ( $moved && FMM_Taxonomy::is_protected( $parent ) ) {
			return self::locked_error( __( 'A locked folder cannot receive folders.', 'fena-media-manager' ) );
		}
		if ( $moved && FMM_Taxonomy::has_locked_descendant( $folder->term_id ) ) {
			return self::locked_error( __( 'A folder that contains a locked folder cannot be moved.', 'fena-media-manager' ) );
		}

		// wp_update_term() only rejects duplicate slugs, not duplicate names. A move is checked in the target level.
		if ( ( isset( $args['name'] ) || $moved ) && FMM_Taxonomy::name_exists( $name, $moved ? $parent : self::effective_parent( $folder ), $folder->term_id ) ) {
			return self::term_error( new WP_Error( 'term_exists' ) );
		}

		$color = null;
		if ( $request->has_param( 'color' ) ) {
			$raw   = $request['color'];
			$reset = in_array( $raw, array( '', 'gray' ), true );
			$color = $reset ? '' : FMM_Taxonomy::sanitize_color( $raw );
			if ( ! $reset && '' === $color ) {
				return new WP_Error( 'fmm_invalid_color', __( 'Invalid folder color.', 'fena-media-manager' ), array( 'status' => 400 ) );
			}
		}

		$icon = null;
		if ( $request->has_param( 'icon' ) ) {
			$raw   = $request['icon'];
			$reset = in_array( $raw, array( '', 'folder' ), true );
			$icon  = $reset ? '' : FMM_Taxonomy::sanitize_icon( $raw );
			if ( ! $reset && '' === $icon ) {
				return new WP_Error( 'fmm_invalid_icon', __( 'Invalid folder icon.', 'fena-media-manager' ), array( 'status' => 400 ) );
			}
		}

		$order = $moved ? FMM_Taxonomy::next_order( $parent ) : 0;
		if ( $args ) {
			$result = wp_update_term( $folder->term_id, FMM_Taxonomy::NAME, $args );
			if ( is_wp_error( $result ) ) {
				return self::term_error( $result );
			}
		}
		if ( $moved ) {
			update_term_meta( $folder->term_id, FMM_Taxonomy::ORDER_META, $order );
		}
		if ( '' === $color ) {
			delete_term_meta( $folder->term_id, FMM_Taxonomy::COLOR_META );
		} elseif ( null !== $color ) {
			update_term_meta( $folder->term_id, FMM_Taxonomy::COLOR_META, $color );
		}
		if ( '' === $icon ) {
			delete_term_meta( $folder->term_id, FMM_Taxonomy::ICON_META );
		} elseif ( null !== $icon ) {
			update_term_meta( $folder->term_id, FMM_Taxonomy::ICON_META, $icon );
		}
		if ( $request->has_param( 'locked' ) ) {
			if ( rest_sanitize_boolean( $request['locked'] ) ) {
				update_term_meta( $folder->term_id, FMM_Taxonomy::LOCK_META, '1' );
			} else {
				delete_term_meta( $folder->term_id, FMM_Taxonomy::LOCK_META );
			}
			FMM_Taxonomy::reset_lock_cache();
		}

		return rest_ensure_response( FMM_Taxonomy::prepare_folder( FMM_Taxonomy::get_folder( $folder->term_id ) ) );
	}

	/**
	 * Error for an action a folder lock forbids.
	 *
	 * @param string $message Translated message.
	 * @return WP_Error
	 */
	private static function locked_error( $message ) {
		return new WP_Error( 'fmm_folder_locked', $message, array( 'status' => 403 ) );
	}

	/**
	 * Effective parent ID of a folder: orphans count as top level.
	 *
	 * @param WP_Term $folder Folder term.
	 * @return int
	 */
	private static function effective_parent( WP_Term $folder ) {
		return FMM_Taxonomy::get_folder( $folder->parent ) ? (int) $folder->parent : 0;
	}

	/**
	 * DELETE /folders/<id>. Removes the folder only; media stays untouched.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function delete_folder( WP_REST_Request $request ) {
		$folder = FMM_Taxonomy::get_folder( $request['id'] );
		if ( ! $folder ) {
			return self::not_found();
		}

		if ( FMM_Taxonomy::is_protected( $folder->term_id ) || FMM_Taxonomy::has_locked_descendant( $folder->term_id ) ) {
			return self::locked_error( __( 'A locked folder, or a folder that contains one, cannot be deleted. Unlock it first.', 'fena-media-manager' ) );
		}

		$result = wp_delete_term( $folder->term_id, FMM_Taxonomy::NAME );
		if ( true !== $result ) {
			return new WP_Error( 'fmm_delete_failed', __( 'The folder could not be deleted.', 'fena-media-manager' ), array( 'status' => 500 ) );
		}

		return rest_ensure_response(
			array(
				'deleted' => true,
				'id'      => (int) $folder->term_id,
			)
		);
	}

	/**
	 * POST /assign. Adds or removes folders for many attachments, or moves
	 * them from `source_folder` to the given folders; each attachment is
	 * checked individually with edit_post.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function assign( WP_REST_Request $request ) {
		$folder_ids = array_values( array_unique( array_map( 'intval', $request['folder_ids'] ) ) );
		$is_move    = 'move' === $request['mode'];
		if ( FMM_Taxonomy::filter_folder_ids( $folder_ids ) !== $folder_ids || ( $is_move && ! FMM_Taxonomy::get_folder( (int) $request['source_folder'] ) ) ) {
			return new WP_Error( 'fmm_invalid_folder', __( 'One or more folders do not exist.', 'fena-media-manager' ), array( 'status' => 400 ) );
		}

		$result = $is_move
			? FMM_Taxonomy::move( $request['attachment_ids'], $folder_ids, (int) $request['source_folder'] )
			: FMM_Taxonomy::assign( $request['attachment_ids'], $folder_ids, 'add' === $request['mode'] );

		if ( empty( $result['updated'] ) ) {
			return new WP_Error(
				'fmm_nothing_updated',
				__( 'None of the selected media files could be updated.', 'fena-media-manager' ),
				array(
					'status'  => 403,
					'skipped' => $result['skipped'],
				)
			);
		}

		$counts = array();
		foreach ( $folder_ids as $folder_id ) {
			$folder                        = FMM_Taxonomy::get_folder( $folder_id );
			$counts[ (string) $folder_id ] = $folder ? (int) $folder->count : 0;
		}

		return rest_ensure_response(
			array(
				'updated' => $result['updated'],
				'skipped' => $result['skipped'],
				'counts'  => $counts,
			)
		);
	}

	/**
	 * 404 error for unknown folders.
	 *
	 * @return WP_Error
	 */
	private static function not_found() {
		return new WP_Error( 'fmm_folder_not_found', __( 'Folder not found.', 'fena-media-manager' ), array( 'status' => 404 ) );
	}

	/**
	 * Maps term API errors to REST errors.
	 *
	 * @param WP_Error $error Term error.
	 * @return WP_Error
	 */
	private static function term_error( WP_Error $error ) {
		if ( in_array( $error->get_error_code(), array( 'term_exists', 'duplicate_term_slug' ), true ) ) {
			return new WP_Error( 'fmm_folder_exists', __( 'A folder with this name already exists.', 'fena-media-manager' ), array( 'status' => 409 ) );
		}
		return new WP_Error( 'fmm_term_error', $error->get_error_message(), array( 'status' => 400 ) );
	}
}
