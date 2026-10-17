package com.examflow.backend.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.jdbc.autoconfigure.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class QuestionBankDataSourceConfig {
    @Bean
    @ConfigurationProperties("questionbank.datasource")
    public DataSourceProperties questionBankDataSourceProperties() {
        return new DataSourceProperties();
    }

    @Bean(name = "questionBankDataSource")
    @ConfigurationProperties("questionbank.datasource.hikari")
    public HikariDataSource questionBankDataSource(
            @org.springframework.beans.factory.annotation.Qualifier("questionBankDataSourceProperties")
            DataSourceProperties properties) {
        HikariDataSource dataSource = properties.initializeDataSourceBuilder()
                .type(HikariDataSource.class).build();
        dataSource.setPoolName("QuestionBankPool");
        dataSource.setMaximumPoolSize(3);
        dataSource.setMinimumIdle(0);
        return dataSource;
    }
}
