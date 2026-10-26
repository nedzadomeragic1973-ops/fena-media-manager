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
					'args'                => $name_arg,
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

		$result = wp_insert_term( $name, FMM_Taxonomy::NAME, array( 'parent' => $parent ) );
		if ( is_wp_error( $result ) ) {
			return self::term_error( $result );
		}

		$response = rest_ensure_response( FMM_Taxonomy::prepare_folder( FMM_Taxonomy::get_folder( $result['term_id'] ) ) );
		$response->set_status( 201 );

		return $response;
	}

	/**
	 * PATCH /folders/<id>. Only the name changes; the slug stays stable.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function update_folder( WP_REST_Request $request ) {
		$folder = FMM_Taxonomy::get_folder( $request['id'] );
		if ( ! $folder ) {
			return self::not_found();
		}

		$name  = FMM_Taxonomy::sanitize_name( $request['name'] );
		$valid = FMM_Taxonomy::validate_name( $name );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}

		// wp_update_term() only rejects duplicate slugs, not duplicate names.
		foreach ( FMM_Taxonomy::get_folders() as $other ) {
			if ( $other['id'] !== (int) $folder->term_id && $other['parent'] === (int) $folder->parent && mb_strtolower( $other['name'] ) === mb_strtolower( $name ) ) {
				return self::term_error( new WP_Error( 'term_exists' ) );
			}
		}

		$result = wp_update_term( $folder->term_id, FMM_Taxonomy::NAME, array( 'name' => $name ) );
		if ( is_wp_error( $result ) ) {
			return self::term_error( $result );
		}

		return rest_ensure_response( FMM_Taxonomy::prepare_folder( FMM_Taxonomy::get_folder( $folder->term_id ) ) );
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
