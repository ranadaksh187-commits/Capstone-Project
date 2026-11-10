package com.peerly.api;

import com.peerly.api.ApiModels.Answer;
import com.peerly.api.ApiModels.CreateAnswerRequest;
import com.peerly.api.ApiModels.CreateDoubtRequest;
import com.peerly.api.ApiModels.Doubt;
import com.peerly.api.ApiModels.Notification;
import com.peerly.api.ApiModels.Peer;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class PeerlyService {
    private static final String STUDENT = "student";
    private static final String DEFAULT_AUTHOR_NAME = "Astha Gill";
    private static final String ANONYMOUS_AUTHOR_NAME = "Anonymous student";
    private final JdbcTemplate jdbc;

    public PeerlyService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Doubt> getDoubts(String subject, String search) {
        String normalizedSubject = subject == null ? "" : subject.trim();
        String normalizedSearch = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
        return jdbc.query("""
                SELECT id, title, description, subject, anonymous, author_name, status, created_at
                FROM doubts
                WHERE (? = '' OR LOWER(subject) = LOWER(?))
                  AND (? = '' OR LOWER(title) LIKE ? OR LOWER(description) LIKE ?)
                ORDER BY created_at DESC
                """, (rs, row) -> {
                    String authorName = displayAuthorName(rs.getBoolean("anonymous"), rs.getString("author_name"));
                    return new Doubt(
                            rs.getLong("id"),
                            rs.getString("title"),
                            rs.getString("description"),
                            rs.getString("subject"),
                            rs.getBoolean("anonymous"),
                            authorName,
                            rs.getString("status"),
                            rs.getTimestamp("created_at").toLocalDateTime().toString(),
                            getAnswers(rs.getLong("id"))
                    );
                }, normalizedSubject, normalizedSubject, normalizedSearch,
                "%" + normalizedSearch + "%", "%" + normalizedSearch + "%");
    }

    @Transactional
    public Doubt createDoubt(CreateDoubtRequest request) {
        String authorName = resolveAuthorName(request.authorName());
        KeyHolder keyHolder = new GeneratedKeyHolder();
        LocalDateTime now = LocalDateTime.now();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO doubts (title, description, subject, anonymous, author_name, status, created_at)
                    VALUES (?, ?, ?, ?, ?, 'OPEN', ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, request.title().trim());
            statement.setString(2, request.description().trim());
            statement.setString(3, request.subject().trim());
            statement.setBoolean(4, request.anonymous());
            statement.setString(5, authorName);
            statement.setTimestamp(6, Timestamp.valueOf(now));
            return statement;
        }, keyHolder);
        Number generatedId = keyHolder.getKey();
        if (generatedId == null) {
            throw new IllegalStateException("The database did not return an ID for the new doubt");
        }

        jdbc.update("INSERT INTO notifications (recipient, message, kind, is_read, created_at) VALUES (?, ?, ?, FALSE, ?)",
                STUDENT, "Your doubt is live. Peers in " + request.subject().trim() + " have been notified.",
                "doubt", Timestamp.valueOf(now));
        recommendPeers(request.subject()).stream().limit(3).forEach(peer ->
                addNotification(peer.name(), "A new " + request.subject().trim() + " doubt may match your expertise.", "match"));
        return getDoubt(generatedId.longValue());
    }

    @Transactional
    public Doubt addAnswer(long doubtId, CreateAnswerRequest request) {
        Doubt doubt = getDoubt(doubtId);
        String authorName = resolveAuthorName(request.authorName());
        Peer peer = findPeer(authorName);
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("""
                INSERT INTO answers (doubt_id, author_name, author_role, content, helpful, created_at)
                VALUES (?, ?, ?, ?, FALSE, ?)
                """, doubtId, peer.name(), peer.role(), request.content().trim(), Timestamp.valueOf(now));
        jdbc.update("UPDATE doubts SET status = 'ANSWERED' WHERE id = ? AND status <> 'RESOLVED'", doubtId);
        addNotification(STUDENT, "New answer on \"" + doubt.title() + "\" from " + peer.name() + ".", "answer");
        return getDoubt(doubtId);
    }

    @Transactional
    public Doubt markAnswerHelpful(long answerId) {
        Map<String, Object> row = jdbc.queryForMap("""
                SELECT a.doubt_id, a.author_name, a.helpful, d.title
                FROM answers a JOIN doubts d ON d.id = a.doubt_id
                WHERE a.id = ?
                """, answerId);
        long doubtId = ((Number) row.get("doubt_id")).longValue();
        String authorName = (String) row.get("author_name");
        if (!Boolean.TRUE.equals(row.get("helpful"))) {
            jdbc.update("UPDATE answers SET helpful = FALSE WHERE doubt_id = ?", doubtId);
            jdbc.update("UPDATE answers SET helpful = TRUE WHERE id = ?", answerId);
            jdbc.update("UPDATE doubts SET status = 'RESOLVED' WHERE id = ?", doubtId);
            int updated = jdbc.update("UPDATE peers SET reputation = reputation + 10 WHERE name = ?", authorName);
            if (updated == 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Answer author no longer has a peer profile");
            }
            addNotification(authorName, "Your answer to \"" + row.get("title") + "\" was marked helpful. +10 points!", "reputation");
            addNotification(STUDENT, "You marked " + authorName + "'s answer helpful. They earned 10 reputation points.", "helpful");
        }
        return getDoubt(doubtId);
    }

    public List<Peer> getPeers(String subject) {
        return recommendPeers(subject);
    }

    public List<Notification> getNotifications(String recipient) {
        String normalizedRecipient = recipient == null || recipient.isBlank() ? STUDENT : recipient.trim();
        return jdbc.query("""
                SELECT id, recipient, message, kind, is_read, created_at
                FROM notifications WHERE recipient = ?
                ORDER BY created_at DESC LIMIT 20
                """, (rs, row) -> new Notification(
                rs.getLong("id"),
                rs.getString("recipient"),
                rs.getString("message"),
                rs.getString("kind"),
                rs.getBoolean("is_read"),
                rs.getTimestamp("created_at").toLocalDateTime().toString()
        ), normalizedRecipient);
    }

    public void markNotificationRead(long notificationId) {
        int updated = jdbc.update("UPDATE notifications SET is_read = TRUE WHERE id = ?", notificationId);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found");
        }
    }

    private Doubt getDoubt(long id) {
        List<Doubt> doubts = jdbc.query("""
                SELECT id, title, description, subject, anonymous, author_name, status, created_at
                FROM doubts WHERE id = ?
                """, (rs, row) -> {
                    String authorName = displayAuthorName(rs.getBoolean("anonymous"), rs.getString("author_name"));
                    return new Doubt(
                            rs.getLong("id"),
                            rs.getString("title"),
                            rs.getString("description"),
                            rs.getString("subject"),
                            rs.getBoolean("anonymous"),
                            authorName,
                            rs.getString("status"),
                            rs.getTimestamp("created_at").toLocalDateTime().toString(),
                            getAnswers(rs.getLong("id"))
                    );
                }, id);
        if (doubts.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Doubt not found");
        }
        return doubts.get(0);
    }

    private List<Answer> getAnswers(long doubtId) {
        return jdbc.query("""
                SELECT id, author_name, author_role, content, helpful, created_at
                FROM answers WHERE doubt_id = ? ORDER BY created_at ASC
                """, (rs, row) -> new Answer(
                rs.getLong("id"),
                rs.getString("author_name"),
                rs.getString("author_role"),
                rs.getString("content"),
                rs.getBoolean("helpful"),
                rs.getTimestamp("created_at").toLocalDateTime().toString()
        ), doubtId);
    }

    private List<Peer> recommendPeers(String subject) {
        List<Peer> peers = jdbc.query("""
                SELECT id, name, role, subjects, reputation, bio, avatar_color FROM peers
                """, (rs, row) -> new Peer(
                rs.getLong("id"),
                rs.getString("name"),
                rs.getString("role"),
                Arrays.stream(rs.getString("subjects").split(",")).map(String::trim).toList(),
                rs.getInt("reputation"),
                rs.getString("bio"),
                rs.getString("avatar_color")
        ));
        String requested = subject == null ? "" : subject.trim();
        peers.sort((left, right) -> {
            boolean leftMatches = left.subjects().stream().anyMatch(value -> value.equalsIgnoreCase(requested));
            boolean rightMatches = right.subjects().stream().anyMatch(value -> value.equalsIgnoreCase(requested));
            int matchOrder = Boolean.compare(rightMatches, leftMatches);
            return matchOrder == 0 ? Integer.compare(right.reputation(), left.reputation()) : matchOrder;
        });
        return peers;
    }

    private Peer findPeer(String name) {
        String normalizedName = name == null ? "" : name.trim();
        List<Peer> peers = jdbc.query("""
                SELECT id, name, role, subjects, reputation, bio, avatar_color
                FROM peers WHERE LOWER(name) = LOWER(?)
                """, (rs, row) -> new Peer(
                rs.getLong("id"),
                rs.getString("name"),
                rs.getString("role"),
                Arrays.stream(rs.getString("subjects").split(",")).map(String::trim).toList(),
                rs.getInt("reputation"),
                rs.getString("bio"),
                rs.getString("avatar_color")
        ), normalizedName);
        if (peers.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a peer from the mentor list");
        }
        return peers.get(0);
    }

    private String resolveAuthorName(String authorName) {
        String normalized = authorName == null ? "" : authorName.trim();
        return normalized.isEmpty() ? DEFAULT_AUTHOR_NAME : normalized;
    }

    private String displayAuthorName(boolean anonymous, String actualAuthorName) {
        if (anonymous) {
            return ANONYMOUS_AUTHOR_NAME;
        }
        return actualAuthorName == null || actualAuthorName.isBlank() ? DEFAULT_AUTHOR_NAME : actualAuthorName.trim();
    }

    private void addNotification(String recipient, String message, String kind) {
        jdbc.update("""
                INSERT INTO notifications (recipient, message, kind, is_read, created_at)
                VALUES (?, ?, ?, FALSE, ?)
                """, recipient, message, kind, Timestamp.valueOf(LocalDateTime.now()));
    }
}
