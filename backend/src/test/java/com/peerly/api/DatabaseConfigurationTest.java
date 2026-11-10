package com.peerly.api;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DatabaseConfigurationTest {
    @Test
    void convertsRenderPostgresConnectionStringToJdbcConfiguration() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("DATABASE_URL", "postgres://peer%20user:p%40ss@db.example:5432/peerly?sslmode=require");
        HikariDataSource dataSource = (HikariDataSource) new DatabaseConfiguration().dataSource(environment);
        try {
            assertEquals("jdbc:postgresql://db.example:5432/peerly?sslmode=require", dataSource.getJdbcUrl());
            assertEquals("peer user", dataSource.getUsername());
            assertEquals("p@ss", dataSource.getPassword());
        } finally {
            dataSource.close();
        }
    }
}
