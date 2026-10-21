package com.examflow.backend.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.jdbc.autoconfigure.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration(proxyBeanMethods = false)
public class MainDataSourceConfig {
    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource")
    public DataSourceProperties mainDataSourceProperties() {
        return new DataSourceProperties();
    }

    @Bean(name = "dataSource")
    @Primary
    @ConfigurationProperties("spring.datasource.hikari")
    public HikariDataSource mainDataSource(DataSourceProperties mainDataSourceProperties) {
        HikariDataSource dataSource = mainDataSourceProperties.initializeDataSourceBuilder()
                .type(HikariDataSource.class).build();
        // Session-mode Supabase slots stay occupied even when a JDBC client is idle.
        // Leave headroom for other clients; explicit spring.datasource.hikari overrides still bind.
        dataSource.setPoolName("MainPool");
        dataSource.setMaximumPoolSize(5);
        dataSource.setMinimumIdle(0);
        dataSource.setIdleTimeout(60_000);
        dataSource.setMaxLifetime(600_000);
        dataSource.setConnectionTimeout(10_000);
        dataSource.addDataSourceProperty("ApplicationName", "ExamFlow-Main/ai-worker-v1");
        return dataSource;
    }
}
