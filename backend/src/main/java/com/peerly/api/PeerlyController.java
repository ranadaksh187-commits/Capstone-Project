package com.peerly.api;

import com.peerly.api.ApiModels.CreateAnswerRequest;
import com.peerly.api.ApiModels.CreateDoubtRequest;
import com.peerly.api.ApiModels.Doubt;
import com.peerly.api.ApiModels.Notification;
import com.peerly.api.ApiModels.Peer;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = {"http://localhost:5173", "http://localhost:3000"})
public class PeerlyController {
    private final PeerlyService service;

    public PeerlyController(PeerlyService service) {
        this.service = service;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    @GetMapping("/doubts")
    public List<Doubt> doubts(
            @RequestParam(required = false) String subject,
            @RequestParam(required = false) String search
    ) {
        return service.getDoubts(subject, search);
    }

    @PostMapping("/doubts")
    public Doubt createDoubt(@Valid @RequestBody CreateDoubtRequest request) {
        return service.createDoubt(request);
    }

    @PostMapping("/doubts/{doubtId}/answers")
    public Doubt addAnswer(@PathVariable long doubtId, @Valid @RequestBody CreateAnswerRequest request) {
        return service.addAnswer(doubtId, request);
    }

    @PutMapping("/answers/{answerId}/helpful")
    public Doubt markHelpful(@PathVariable long answerId) {
        return service.markAnswerHelpful(answerId);
    }

    @GetMapping("/peers")
    public List<Peer> peers(@RequestParam(required = false) String subject) {
        return service.getPeers(subject);
    }

    @GetMapping("/notifications")
    public List<Notification> notifications(@RequestParam(required = false) String recipient) {
        return service.getNotifications(recipient);
    }

    @PutMapping("/notifications/{notificationId}/read")
    public ResponseEntity<Void> markRead(@PathVariable long notificationId) {
        service.markNotificationRead(notificationId);
        return ResponseEntity.noContent().build();
    }
}
