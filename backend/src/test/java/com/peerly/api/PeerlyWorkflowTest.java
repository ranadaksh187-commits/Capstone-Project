package com.peerly.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "DB_URL=jdbc:h2:mem:peerly-workflow;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class PeerlyWorkflowTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void studentCanPostQuestionReceiveAnswerAndMarkItHelpful() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"));

        mockMvc.perform(get("/api/doubts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].authorName", not(hasItem("Anonymous student"))));

        String title = "Workflow test " + UUID.randomUUID();
        String doubtResponse = mockMvc.perform(post("/api/doubts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "%s",
                                  "description": "Checking the evaluation workflow.",
                                  "subject": "Mathematics",
                                  "anonymous": false,
                                  "authorName": "Astha Gill"
                                }
                                """.formatted(title)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value(title))
                .andExpect(jsonPath("$.authorName").value("Astha Gill"))
                .andExpect(jsonPath("$.anonymous").value(false))
                .andReturn().getResponse().getContentAsString();

        long doubtId = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(doubtResponse).get("id").asLong();
        String answerResponse = mockMvc.perform(post("/api/doubts/{id}/answers", doubtId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "authorName": "Isha Kapoor",
                                  "content": "Try simplifying the expression before evaluating the limit."
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ANSWERED"))
                .andExpect(jsonPath("$.answers", hasSize(1)))
                .andReturn().getResponse().getContentAsString();

        long answerId = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(answerResponse).get("answers").get(0).get("id").asLong();

        mockMvc.perform(put("/api/answers/{id}/helpful", answerId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RESOLVED"))
                .andExpect(jsonPath("$.answers[0].helpful").value(true));

        mockMvc.perform(get("/api/notifications").param("recipient", "student"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].message", hasItem(
                        org.hamcrest.Matchers.containsString("marked helpful"))));
    }

    @Test
    void currentStudentCanAnswerAndEarnHelpfulPoints() throws Exception {
        String title = "Student answer test " + UUID.randomUUID();
        String doubtResponse = mockMvc.perform(post("/api/doubts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "%s",
                                  "description": "A test question for the student's answer flow.",
                                  "subject": "Mathematics",
                                  "anonymous": false,
                                  "authorName": "Astha Gill"
                                }
                                """.formatted(title)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long doubtId = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(doubtResponse).get("id").asLong();

        String answerResponse = mockMvc.perform(post("/api/doubts/{id}/answers", doubtId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "authorName": "Astha Gill",
                                  "content": "Try rewriting the expression before substituting the limit."
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answers[0].authorName").value("Astha Gill"))
                .andReturn().getResponse().getContentAsString();
        long answerId = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(answerResponse).get("answers").get(0).get("id").asLong();

        mockMvc.perform(put("/api/answers/{id}/helpful", answerId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answers[0].helpful").value(true));

        String peerResponse = mockMvc.perform(get("/api/peers").param("subject", "Mathematics"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var peers = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(peerResponse);
        for (var peer : peers) {
            if ("Astha Gill".equals(peer.get("name").asText())) {
                assertTrue(peer.get("reputation").asInt() >= 10);
                return;
            }
        }
        throw new AssertionError("The current student's peer profile should be included in peer results");
    }
}
