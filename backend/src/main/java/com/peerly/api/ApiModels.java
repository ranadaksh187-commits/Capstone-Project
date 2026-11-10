package com.peerly.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public final class ApiModels {
    private ApiModels() {
    }

    public record Peer(
            long id,
            String name,
            String role,
            List<String> subjects,
            int reputation,
            String bio,
            String avatarColor
    ) {
    }

    public record Answer(
            long id,
            String authorName,
            String authorRole,
            String content,
            boolean helpful,
            String createdAt
    ) {
    }

    public record Doubt(
            long id,
            String title,
            String description,
            String subject,
            boolean anonymous,
            String authorName,
            String status,
            String createdAt,
            List<Answer> answers
    ) {
    }

    public record Notification(
            long id,
            String recipient,
            String message,
            String kind,
            boolean read,
            String createdAt
    ) {
    }

    public record CreateDoubtRequest(
            @NotBlank @Size(max = 180) String title,
            @NotBlank @Size(max = 3000) String description,
            @NotBlank @Size(max = 80) String subject,
            boolean anonymous,
            @Size(max = 100) String authorName
    ) {
    }

    public record CreateAnswerRequest(
            @NotBlank @Size(max = 100) String authorName,
            @NotBlank @Size(max = 3000) String content
    ) {
    }
}
