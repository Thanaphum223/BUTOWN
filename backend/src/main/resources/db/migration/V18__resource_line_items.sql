ALTER TABLE resource_revision ADD COLUMN line_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE resource_revision ADD CONSTRAINT resource_line_items_array CHECK (jsonb_typeof(line_items)='array' AND jsonb_array_length(line_items)<=50);
