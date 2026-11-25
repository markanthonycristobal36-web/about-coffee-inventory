# About Coffee Stockroom

A PHP and MySQL inventory system for tracking ingredients and packaging supplies. The dashboard shows stock levels, recent movements, and alerts for low stock and expiring batches.

## Run locally with XAMPP

1. Copy the repository contents into a folder named `about-coffee` inside XAMPP's `htdocs`.
2. Start Apache and MySQL from the XAMPP Control Panel.
3. Open `http://localhost/about-coffee/` on the same computer.
4. Create the first owner account. Select the sample items option to try the system with demonstration inventory.

The first-time setup creates the database and tables using `app/schema.sql`. If your MySQL installation uses different credentials, configure the environment variables referenced in `app/config.php`.
