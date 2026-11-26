-- Ministry of Interior regulation on the use and care of local government vehicles B.E. 2548,
-- amended (No. 2) B.E. 2563: a vehicle goes out on a written request (form 3) and each trip is
-- logged with its odometer readings (form 4). A vehicle is equipment with a licence plate, so it
-- also follows the equipment loan rules (procurement regulation 2560, clauses 208-211).

ALTER TABLE stock_item ADD COLUMN IF NOT EXISTS vehicle_plate varchar(20);
ALTER TABLE stock_item DROP CONSTRAINT IF EXISTS stock_item_vehicle_is_equipment;
ALTER TABLE stock_item ADD CONSTRAINT stock_item_vehicle_is_equipment
  CHECK (vehicle_plate IS NULL OR item_type = 'EQUIPMENT');

-- The executive may waive form 3 for use within the municipality's own area.
ALTER TABLE municipality ADD COLUMN IF NOT EXISTS vehicle_local_exempt boolean NOT NULL DEFAULT false;

-- Form 3 details sent with a resource request that includes a vehicle.
ALTER TABLE resource_request ADD COLUMN IF NOT EXISTS vehicle_use jsonb;

-- Form 4 trip log. Like the loan register it outlives the complaint, so its links are nullable.
CREATE TABLE IF NOT EXISTS vehicle_trip(
  id uuid PRIMARY KEY,
  municipality_id uuid NOT NULL REFERENCES municipality,
  stock_item_id uuid NOT NULL REFERENCES stock_item,
  complaint_id uuid REFERENCES complaint,
  resource_id uuid REFERENCES resource_request,
  work_order_id uuid REFERENCES work_order,
  user_id uuid NOT NULL REFERENCES app_user,
  driver_name text NOT NULL DEFAULT '',
  destination text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  local_use boolean NOT NULL DEFAULT false,
  departed_at timestamptz NOT NULL DEFAULT now(),
  odometer_out numeric(9,1) NOT NULL CHECK (odometer_out >= 0),
  arrived_at timestamptz,
  odometer_in numeric(9,1),
  cancelled_at timestamptz,
  CHECK ((arrived_at IS NULL) = (odometer_in IS NULL)),
  CHECK (odometer_in IS NULL OR odometer_in >= odometer_out)
);
CREATE INDEX IF NOT EXISTS vehicle_trip_work ON vehicle_trip(work_order_id);
CREATE INDEX IF NOT EXISTS vehicle_trip_complaint ON vehicle_trip(complaint_id);
CREATE INDEX IF NOT EXISTS vehicle_trip_item ON vehicle_trip(stock_item_id, departed_at DESC);
