<?php
// XAMPP defaults. Override here or set the corresponding environment variables.
return [
    'host' => getenv('AC_DB_HOST') ?: '127.0.0.1',
    'port' => getenv('AC_DB_PORT') ?: '3306',
    'database' => getenv('AC_DB_NAME') ?: 'about_coffee_inventory',
    'user' => getenv('AC_DB_USER') ?: 'root',
    'password' => getenv('AC_DB_PASSWORD') ?: '',
];
