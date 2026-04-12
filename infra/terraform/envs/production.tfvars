# Production environment — do NOT commit real secrets here.
# Set sensitive values via TF_VAR_railway_token and TF_VAR_cloudflare_api_token.

environment        = "production"
domain             = "railbird.xyz"
cloudflare_zone_id = "REPLACE_WITH_ZONE_ID"
indexer_origin     = ""  # set after first Railway deploy
ownerview_origin   = ""  # set after first Railway deploy
