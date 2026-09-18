package edu.kit.cbc.editor;

import edu.kit.cbc.editor.verifier.ResolvedVerifier;
import edu.kit.cbc.editor.verifier.VerifierClient;
import edu.kit.cbc.editor.verifier.VerifierClientException;
import edu.kit.cbc.editor.verifier.job.NarrowedProgram;
import edu.kit.cbc.editor.verifier.job.SourceFile;
import edu.kit.cbc.editor.verifier.job.StartJobRequest;
import edu.kit.cbc.editor.verifier.job.StatusMessage;
import io.micronaut.scheduling.TaskExecutors;
import jakarta.inject.Named;
import jakarta.inject.Singleton;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.function.Consumer;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Calls every enabled Verifier of one job at the same time, one run per Verifier on the
 * blocking executor. A failure at any step is that Verifier's alone: a log line saying why,
 * then its {@code done(proven: false)}. A Verifier's done goes out only once its result is
 * merged into the formula, so a Verifier that said proven but whose result is lost counts as
 * failed. No timeout on a stream that never sends done.
 */
@Singleton
public class VerifierFanOut {

    private static final Logger LOGGER = Logger.getGlobal();

    private final VerifierClient client;
    private final Executor executor;

    public VerifierFanOut(VerifierClient client, @Named(TaskExecutors.BLOCKING) Executor executor) {
        this.client = client;
        this.executor = executor;
    }

    /**
     * Returns once every Verifier has reported done through {@code sink}, which is called from
     * the Verifiers' threads. {@code jobId} is reused verbatim as every Verifier's job id.
     */
    public void run(UUID jobId, NarrowedProgram program, List<SourceFile> files, List<ResolvedVerifier> verifiers,
                    Consumer<VerificationMessage> sink) {
        List<CompletableFuture<Void>> runs = verifiers.stream()
            .map(verifier -> CompletableFuture.runAsync(() -> runOne(jobId, program, files, verifier, sink), executor))
            .toList();
        CompletableFuture.allOf(runs.toArray(CompletableFuture[]::new)).join();
    }

    private void runOne(UUID jobId, NarrowedProgram program, List<SourceFile> files, ResolvedVerifier verifier,
                        Consumer<VerificationMessage> sink) {
        String id = verifier.id();
        String failure = "could not be started";
        StatusMessage.Done done;
        try {
            client.startJob(id, jobId, new StartJobRequest(program.forVerifier(id), files, verifier.settings()));
            failure = "did not finish";
            done = client.streamStatus(id, jobId, log -> sink.accept(VerificationMessage.log(id, log.message())));
            failure = "finished, but its result could not be fetched";
            program.merge(id, client.fetchResult(id, jobId));
        } catch (VerifierClientException e) {
            fail(sink, id, failure + ": " + e.getMessage());
            return;
        } catch (RuntimeException e) {
            // A bug, not the Verifier's fault: reported like a failure so the job still completes.
            LOGGER.log(Level.SEVERE, "Verification run of Verifier '" + id + "' failed unexpectedly", e);
            fail(sink, id, "failed unexpectedly: " + e.getMessage());
            return;
        }
        sink.accept(VerificationMessage.done(id, done.proven()));
    }

    private static void fail(Consumer<VerificationMessage> sink, String id, String reason) {
        sink.accept(VerificationMessage.log(id, "Verifier '" + id + "' " + reason));
        sink.accept(VerificationMessage.done(id, false));
    }
}
