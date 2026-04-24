-- Remove legacy placeholder rows that were written before the table context
-- was hydrated from chain state. Real tables are strictly positive.
DELETE FROM actions WHERE table_id = 0;
DELETE FROM settlements WHERE table_id = 0;
DELETE FROM hands WHERE table_id = 0;
DELETE FROM vrf_requests WHERE table_id = 0;
DELETE FROM seats WHERE table_id = 0;
DELETE FROM poker_tables WHERE table_id = 0;
