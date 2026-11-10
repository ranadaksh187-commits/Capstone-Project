package com.peerly.api;

import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Component;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;

@Component
public class DemoData implements CommandLineRunner {
    private final JdbcTemplate jdbc;

    public DemoData(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        updateSampleAuthors();
        jdbc.update("UPDATE doubts SET author_name = ?, anonymous = FALSE WHERE author_name = 'Anonymous student'", "Astha");

        Integer peerCount = jdbc.queryForObject("SELECT COUNT(*) FROM peers", Integer.class);
        if (peerCount != null && peerCount == 0) {
            addPeer("Aarav Mehta", "Senior student", "Computer Science,Data Structures", 1280,
                    "Makes tricky algorithms feel simple.", "#c8e7dc");
            addPeer("Isha Kapoor", "Mentor", "Mathematics,Physics", 1120,
                    "Patient mentor, one step at a time.", "#f5d6bd");
            addPeer("Kabir Shah", "Senior student", "Computer Science,Database Systems", 960,
                    "Building things and sharing what I learn.", "#ded6fa");
            addPeer("Meera Nair", "Mentor", "Physics,Mathematics", 850,
                    "Here for the questions you are afraid to ask.", "#f8d7dc");
        }
        Integer studentProfileCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM peers WHERE LOWER(name) = LOWER(?)", Integer.class, "Astha Gill");
        if (studentProfileCount != null && studentProfileCount == 0) {
            addPeer("Astha Gill", "Student", "Computer Science,Mathematics,Physics,Database Systems", 0,
                    "Learning by asking questions and sharing clear explanations.", "#f4d7bf");
        }

        Integer doubtCount = jdbc.queryForObject("SELECT COUNT(*) FROM doubts", Integer.class);
        if (doubtCount != null && doubtCount == 0) {
            LocalDateTime now = LocalDateTime.now();
            long joinsId = insertDoubt("How do I understand recursion without getting lost?",
                    "I can follow a trace on paper, but I struggle to see how the smaller calls build the final answer. Any intuition or visual explanation would help.",
                    "Computer Science", "Rohan Verma", "RESOLVED", now.minusHours(2));
            long limitsId = insertDoubt("Why does the limit still work when direct substitution gives 0/0?",
                    "I am revising limits and keep treating 0/0 as the answer. What does it really tell us, and how should I choose the next step?",
                    "Mathematics", "Astha Gill", "OPEN", now.minusHours(5));
            long sqlId = insertDoubt("When should I use a LEFT JOIN instead of an INNER JOIN?",
                    "I understand the syntax, but I am unsure how to decide which join matches a real question about data.",
                    "Database Systems", "Aisha Khan", "OPEN", now.minusHours(9));
            addAnswer(joinsId, "Aarav Mehta", "Senior student",
                    "Think of each call as pausing right before solving a smaller version of the same problem. The base case is where that pause ends; then each waiting call uses the result beneath it. Try drawing just three calls and returning upward.");
            jdbc.update("""
                    INSERT INTO answers (doubt_id, author_name, author_role, content, helpful, created_at)
                    VALUES (?, ?, ?, ?, TRUE, ?)
                    """, joinsId, "Aarav Mehta", "Senior student",
                    "A call stack sketch helped me too: draw one box per call, then fill in the return values from the bottom up.",
                    Timestamp.valueOf(now.minusMinutes(35)));
            addAnswer(limitsId, "Isha Kapoor", "Mentor",
                    "The indeterminate form means substitution alone cannot tell you the limit. Try factoring, simplifying, or using a conjugate, then evaluate the simplified expression.");
            addAnswer(sqlId, "Kabir Shah", "Senior student",
                    "Use LEFT JOIN when every row on the left should stay in your result, even if it has no match. INNER JOIN keeps only rows that match on both sides.");
            jdbc.update("UPDATE peers SET reputation = reputation + 10 WHERE name = 'Aarav Mehta'");
            jdbc.update("""
                    INSERT INTO notifications (recipient, message, kind, is_read, created_at)
                    VALUES (?, ?, ?, FALSE, ?)
                    """, "student", "Aarav Mehta's recursion explanation was marked helpful. Your community is growing!", "welcome",
                    Timestamp.valueOf(now.minusMinutes(30)));
        }
    }

    private void addPeer(String name, String role, String subjects, int reputation, String bio, String color) {
        jdbc.update("""
                INSERT INTO peers (name, role, subjects, reputation, bio, avatar_color)
                VALUES (?, ?, ?, ?, ?, ?)
                """, name, role, subjects, reputation, bio, color);
    }

    private void updateSampleAuthors() {
        jdbc.update("""
                UPDATE doubts SET author_name = ?, anonymous = FALSE
                WHERE title = ? AND author_name = 'Anonymous student'
                """, "Rohan Verma", "How do I understand recursion without getting lost?");
        jdbc.update("""
                UPDATE doubts SET author_name = ?, anonymous = FALSE
                WHERE title = ? AND author_name = 'Anonymous student'
                """, "Astha Gill", "Why does the limit still work when direct substitution gives 0/0?");
        jdbc.update("""
                UPDATE doubts SET author_name = ?, anonymous = FALSE
                WHERE title = ? AND author_name = 'Anonymous student'
                """, "Aisha Khan", "When should I use a LEFT JOIN instead of an INNER JOIN?");
    }

    private long insertDoubt(String title, String description, String subject, String author, String status, LocalDateTime createdAt) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO doubts (title, description, subject, anonymous, author_name, status, created_at)
                    VALUES (?, ?, ?, FALSE, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, title);
            statement.setString(2, description);
            statement.setString(3, subject);
            statement.setString(4, author);
            statement.setString(5, status);
            statement.setTimestamp(6, Timestamp.valueOf(createdAt));
            return statement;
        }, keyHolder);
        Number generatedId = keyHolder.getKey();
        if (generatedId == null) {
            throw new IllegalStateException("The database did not return an ID for a demo doubt");
        }
        return generatedId.longValue();
    }

    private void addAnswer(long doubtId, String author, String role, String content) {
        jdbc.update("""
                INSERT INTO answers (doubt_id, author_name, author_role, content, helpful, created_at)
                VALUES (?, ?, ?, ?, FALSE, ?)
                """, doubtId, author, role, content, Timestamp.valueOf(LocalDateTime.now().minusMinutes(50)));
    }
}
