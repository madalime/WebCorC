package edu.kit.cbc.editor;

import edu.kit.cbc.common.corc.cbcmodel.CbCFormula;
import edu.kit.cbc.common.corc.cbcmodel.Condition;
import edu.kit.cbc.common.corc.cbcmodel.StatementType;
import edu.kit.cbc.common.corc.cbcmodel.statements.AbstractStatement;
import edu.kit.cbc.common.corc.proof.ProofContext;
import edu.kit.cbc.editor.verifier.FakeVerifierClient;
import edu.kit.cbc.editor.verifier.Verifier;
import edu.kit.cbc.editor.verifier.VerifierCatalog;
import edu.kit.cbc.editor.verifier.VerifierCatalogService;
import edu.kit.cbc.editor.verifier.job.StatementResult;
import edu.kit.cbc.editor.verifier.job.StatusMessage;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

/**
 * One verification job end to end, with a stub in place of the KeY-backed statement: functional
 * verification runs first and reports its own done; only its success (and
 * {@code functionalOnly=false}) fans out to the enabled Verifiers; the final complete comes
 * exactly once, after everyone, and is what makes the result available. Late subscribers get the
 * whole history first.
 */
class VerificationJobTest {

    private static final UUID JOB = UUID.randomUUID();
    private static final String FUNC = VerifierCatalogService.FUNCTIONAL_VERIFIER_ID;
    private static final VerifierCatalog CATALOG = new VerifierCatalog(List.of(
        new Verifier(FUNC, "Functional correctness", true, false, null, List.of(), List.of(), null),
        new Verifier("mock", "Mock", true, true, null, List.of(), List.of(), null),
        new Verifier("off", "Off", false, true, null, List.of(), List.of(), null)), null);

    /** Stands in for a KeY-proven statement: a fixed verdict, one log line. */
    private static final class StubStatement extends AbstractStatement {

        private final boolean verdict;

        StubStatement(boolean verdict) {
            this.verdict = verdict;
            setName("Stub");
            setType(StatementType.STATEMENT);
            setPreCondition(Condition.fromString("x == 0"));
            setPostCondition(Condition.fromString("x == 1"));
        }

        @Override
        public boolean prove(ProofContext proofContext) {
            proofContext.getLogger().accept("proving " + getName());
            setProven(verdict);
            return verdict;
        }

        @Override
        public String generateCode() {
            return "";
        }

        @Override
        public String generateCodeForProof() {
            return "";
        }
    }

    private final List<VerificationMessage> messages = new CopyOnWriteArrayList<>();
    private final CountDownLatch completed = new CountDownLatch(1);
    private VerificationJob job;

    @AfterEach
    void stopRetainingTheResult() {
        if (job != null) {
            job.interrupt();
        }
    }

    private VerificationJob start(boolean functionalOnly, boolean functionalVerdict, FakeVerifierClient client) throws Exception {
        CbCFormula formula = new CbCFormula("Demo", new StubStatement(functionalVerdict), List.of(), List.of(), List.of(), null, false);
        job = new VerificationJob(JOB, Optional.empty(), functionalOnly, formula, null,
            new VerifierFanOut(client, Runnable::run), CompletableFuture.completedFuture(CATALOG), () -> { });
        job.subscribe(message -> {
            messages.add(message);
            if (VerificationMessage.COMPLETE.equals(message.type())) {
                completed.countDown();
            }
            return false;
        });
        job.start();
        return job;
    }

    private void awaitComplete() throws InterruptedException {
        Assertions.assertTrue(completed.await(10, TimeUnit.SECONDS), "The job never completed: " + messages);
    }

    private List<VerificationMessage> of(String verifier) {
        return messages.stream().filter(message -> verifier.equals(message.verifier())).toList();
    }

    private List<String> types() {
        return messages.stream().map(VerificationMessage::type).toList();
    }

    @Test
    void functionalOnlyJobReportsFunctionalDoneThenCompleteAndCallsNoVerifier() throws Exception {
        FakeVerifierClient client = new FakeVerifierClient();

        start(true, true, client);
        awaitComplete();

        Assertions.assertEquals(VerificationMessage.log(FUNC, "verification initialized"), messages.get(0),
            "What the constructor logged is delivered on subscribe");
        Assertions.assertTrue(messages.contains(VerificationMessage.log(FUNC, "proving Stub")), "Functional log lines are tagged func");
        List<VerificationMessage> tail = messages.subList(messages.size() - 2, messages.size());
        Assertions.assertEquals(List.of(VerificationMessage.done(FUNC, true), VerificationMessage.complete()), tail);
        Assertions.assertEquals(List.of(FUNC), messages.stream().map(VerificationMessage::verifier)
            .filter(v -> v != null).distinct().toList(), "Nothing but the Functional Verifier spoke");
        Assertions.assertTrue(client.startedJobs().isEmpty());
        Assertions.assertTrue(job.isHasResult());
        Assertions.assertTrue(job.getFormula().isProven());
    }

    @Test
    void functionalFailureEndsTheJobWithoutCallingAnyVerifier() throws Exception {
        FakeVerifierClient client = new FakeVerifierClient().running("mock", Map.of(), new StatusMessage.Done(true));

        start(false, false, client);
        awaitComplete();

        List<VerificationMessage> tail = messages.subList(messages.size() - 2, messages.size());
        Assertions.assertEquals(List.of(VerificationMessage.done(FUNC, false), VerificationMessage.complete()), tail);
        Assertions.assertTrue(client.startedJobs().isEmpty(), "No Verifier runs against a program that failed functionally");
        Assertions.assertTrue(of("mock").isEmpty());
        Assertions.assertFalse(job.getFormula().isProven());
    }

    @Test
    void functionalSuccessFansOutToTheEnabledVerifiersAndCompletesOnceAfterAllOfThem() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        FakeVerifierClient client = new FakeVerifierClient()
            .running("mock", Map.of("1", new StatementResult(true, "ok")), new StatusMessage.Log("checking"), new StatusMessage.Done(true))
            .holdingDone("mock", release)
            .running("off", Map.of(), new StatusMessage.Done(true));

        start(false, true, client);
        long deadline = System.currentTimeMillis() + 5000;
        while (of("mock").isEmpty() && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }

        Assertions.assertEquals(List.of(VerificationMessage.log("mock", "checking")), of("mock"));
        Assertions.assertTrue(messages.contains(VerificationMessage.done(FUNC, true)), "Functional's own done came first");
        Assertions.assertFalse(job.isHasResult(), "No result while a Verifier is still running");
        Assertions.assertFalse(types().contains(VerificationMessage.COMPLETE));

        release.countDown();
        awaitComplete();

        Assertions.assertEquals(1, types().stream().filter(VerificationMessage.COMPLETE::equals).count(), "Complete exactly once");
        Assertions.assertEquals(VerificationMessage.complete(), messages.get(messages.size() - 1));
        Assertions.assertEquals(VerificationMessage.done("mock", true), messages.get(messages.size() - 2));
        Assertions.assertEquals(List.of("mock"), client.startedJobs().stream().map(FakeVerifierClient.StartedJob::id).toList(),
            "Only the enabled Verifier is called; func is built in and 'off' is disabled");
        Assertions.assertEquals(List.of(), client.startedJobs().get(0).request().files(), "No project: no files, still attached");
        Assertions.assertTrue(job.isHasResult());
        Assertions.assertEquals(Boolean.TRUE, job.getFormula().getStatement().getVerifiers().get("mock").proven());
        Assertions.assertEquals("ok", job.getFormula().getStatement().getVerifiers().get("mock").status());
        Assertions.assertTrue(job.getFormula().isProven(), "The Functional Verifier's verdict is untouched");
    }

    @Test
    void aLateSubscriberGetsTheWholeHistoryOnceInOrder() throws Exception {
        start(true, true, new FakeVerifierClient());
        awaitComplete();
        List<VerificationMessage> replayed = new ArrayList<>();

        job.subscribe(message -> {
            replayed.add(message);
            return false;
        });

        Assertions.assertEquals(messages, replayed);
    }

    @Test
    void aListenerReportingItsConnectionClosedIsDropped() throws Exception {
        List<VerificationMessage> seen = new ArrayList<>();
        FakeVerifierClient client = new FakeVerifierClient();
        CbCFormula formula = new CbCFormula("Demo", new StubStatement(true), List.of(), List.of(), List.of(), null, false);
        job = new VerificationJob(JOB, Optional.empty(), true, formula, null,
            new VerifierFanOut(client, Runnable::run), CompletableFuture.completedFuture(CATALOG), () -> { });
        job.subscribe(message -> {
            seen.add(message);
            return true;
        });
        job.subscribe(message -> {
            messages.add(message);
            if (VerificationMessage.COMPLETE.equals(message.type())) {
                completed.countDown();
            }
            return false;
        });

        job.start();
        awaitComplete();

        Assertions.assertEquals(List.of(VerificationMessage.log(FUNC, "verification initialized")), seen,
            "Dropped on its first message, which was the replayed history");
    }
}
