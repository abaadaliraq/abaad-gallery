import type {Json} from "./protocol-database";
export type SalesFunctions={
 sales_collection_snapshot:{Args:{p_slug:string;p_query?:string;p_artist?:string|null;p_status?:string;p_page?:number;p_collection?:string};Returns:Json};
 sales_snapshot:{Args:{p_slug:string;p_query?:string;p_artist?:string|null;p_status?:string;p_page?:number};Returns:Json};
 sales_photo_ref:{Args:{p_listing_id:string};Returns:Json};
 sales_transition:{Args:{p_listing_id:string;p_status:string;p_version:number;p_operation_id:string;p_reason?:string};Returns:Json};
 sales_save_artwork:{Args:{p_slug:string;p_data:Json;p_listing_id?:string|null;p_version?:number|null};Returns:Json};
 sales_save_artist:{Args:{p_slug:string;p_name_ar:string;p_name_en:string;p_artist_id?:string|null};Returns:Json};
 sales_history:{Args:{p_listing_id:string};Returns:Json};
 sales_import_plan:{Args:{p_slug:string;p_rows:Json};Returns:Json};
 sales_import_artworks:{Args:{p_slug:string;p_rows:Json};Returns:Json};
};
