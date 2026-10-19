package com.examflow.backend.config;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class DatabaseConnectionCheck implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DatabaseConnectionCheck.class);
    private final DataSource main;
    private final DataSource questionBank;

    public DatabaseConnectionCheck(@Qualifier("dataSource") DataSource main,
                                   @Qualifier("questionBankDataSource") DataSource questionBank) {
        this.main = main;
        this.questionBank = questionBank;
    }

    @Override
    public void run(ApplicationArguments args) {
        check("ExamFlow Main", main);
        check("Question Bank", questionBank);
    }

    private void check(String label, DataSource dataSource) {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT 1")) {
            if (result.next() && result.getInt(1) == 1) {
                log.info("[DB CHECK] {}: CONNECTED", label);
            } else {
                log.error("[DB CHECK] {}: unexpected health-check result", label);
            }
        } catch (Exception ex) {
            log.error("[DB CHECK] {}: CONNECTION FAILED (check URL, username, password, network and SSL)", label);
            // Phase 2A is read-only diagnostic: do not interrupt existing exam functionality.
        }
    }
}
