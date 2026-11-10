package com.peerly.api;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

@Configuration
public class DatabaseConfiguration {
    @Bean
    DataSource dataSource(Environment environment) {
        String databaseUrl = environment.getProperty("DATABASE_URL");
        String url = environment.getProperty("DB_URL", "jdbc:h2:file:./data/peerly;DB_CLOSE_ON_EXIT=FALSE");
        String username = environment.getProperty("DB_USER", "sa");
        String password = environment.getProperty("DB_PASSWORD", "");

        if (databaseUrl != null && !databaseUrl.isBlank()) {
            URI parsed = URI.create(databaseUrl);
            if (!"postgres".equals(parsed.getScheme()) && !"postgresql".equals(parsed.getScheme())) {
                throw new IllegalArgumentException("DATABASE_URL must use the postgres:// or postgresql:// scheme");
            }
            String authority = parsed.getRawAuthority();
            String userInfo = parsed.getRawUserInfo();
            if (userInfo != null) {
                authority = authority.substring(userInfo.length() + 1);
                String[] credentials = userInfo.split(":", 2);
                username = decode(credentials[0]);
                if (credentials.length == 2) {
                    password = decode(credentials[1]);
                }
            }
            url = "jdbc:postgresql://" + authority + parsed.getRawPath();
            if (parsed.getRawQuery() != null) {
                url += "?" + parsed.getRawQuery();
            }
        }

        HikariDataSource dataSource = new HikariDataSource();
        dataSource.setJdbcUrl(url);
        dataSource.setUsername(username);
        dataSource.setPassword(password);
        return dataSource;
    }

    private String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
}
