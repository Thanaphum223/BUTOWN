ALTER TABLE complaint ADD COLUMN form_schema jsonb NOT NULL DEFAULT '[]';
UPDATE complaint c SET form_schema=k.fields FROM category k WHERE k.id=c.category_id;
