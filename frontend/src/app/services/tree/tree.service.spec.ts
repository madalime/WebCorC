import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { Subject } from "rxjs";

import { TreeService } from "./tree.service";
import { VerifierService } from "../verifier/verifier.service";
import { ProjectService } from "../project/project.service";
import { GlobalSettingsService } from "../global-settings.service";
import { environment } from "../../../environments/environment";
import { Verifier } from "../../types/Verifier";
import { LocalCBCFormula } from "../../types/CBCFormula";
import { RootStatement } from "../../types/statements/root-statement";
import { IAbstractStatement, IVerifiers, NodeState } from "../../types/statements/abstract-statement";
import { Condition } from "../../types/condition/condition";

describe("TreeService", () => {
  const catalogUrl = environment.apiUrl + "/editor/verifiers";

  const functionalVerifier: Verifier = {
    id: "func", label: "Functional correctness", enabled: true, toggleable: false, settings: [], variables: [],
  };
  const mockVerifier = (enabled: boolean): Verifier => ({
    id: "mock", label: "Mock", enabled, toggleable: true,
    settings: [{ id: "threshold", label: "Threshold", type: "text" }],
    variables: [],
  });

  let service: TreeService;
  let verifierService: VerifierService;
  let httpTesting: HttpTestingController;
  let projectServiceStub: Partial<ProjectService>;

  function loadCatalog(verifiers: Verifier[]): void {
    httpTesting.expectOne(catalogUrl).flush({ verifiers });
  }

  /** Builds a single-node tree (root only) with the given state/entries, via the public `setFormula` seam. */
  function buildRootNode(nodeState: NodeState, verifiers: IVerifiers): RootStatement {
    const root = new RootStatement("root", new Condition("true"), new Condition("true"), undefined);
    root.nodeState = nodeState;
    root.verifiers = verifiers;
    service.setFormula(new LocalCBCFormula("f", root), "urn");
    return root;
  }

  beforeEach(() => {
    projectServiceStub = {
      getVerifierOverrides: () => null,
      saveVerifierOverrides: () => undefined,
      verifierOverridesLoaded: new Subject<void>(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProjectService, useValue: projectServiceStub },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    verifierService = TestBed.inject(VerifierService);
    service = TestBed.inject(TreeService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it("should be created", () => {
    loadCatalog([]);
    expect(service).toBeTruthy();
  });

  describe("overrides subscription (decision 4)", () => {
    it("setEnabled on a Verifier that ran keeps verified-all", () => {
      loadCatalog([functionalVerifier, mockVerifier(true)]);
      const root = buildRootNode("verified-all", {
        func: { proven: true },
        mock: { proven: true },
      });

      verifierService.setEnabled("mock", true);

      expect(root.nodeState).toBe("verified-all");
    });

    it("enabling a Verifier whose entry is disabled:true yields settings-changed", () => {
      loadCatalog([functionalVerifier, mockVerifier(false)]);
      const root = buildRootNode("verified-functional", {
        func: { proven: true },
        mock: { proven: false, disabled: true },
      });

      verifierService.setEnabled("mock", true);

      expect(root.nodeState).toBe("settings-changed");
    });

    it("updateSetting on an enabled Verifier flips verified-all nodes to settings-changed only", () => {
      loadCatalog([functionalVerifier, mockVerifier(true)]);
      const root = buildRootNode("verified-all", {
        func: { proven: true },
        mock: { proven: true },
      });

      verifierService.updateSetting("mock", "threshold", "5");

      expect(root.nodeState).toBe("settings-changed");
    });

    it("updateSetting on a Verifier that is not enabled leaves node state alone", () => {
      loadCatalog([functionalVerifier, mockVerifier(false)]);
      const root = buildRootNode("verified-functional", {
        func: { proven: true },
      });

      verifierService.updateSetting("mock", "threshold", "5");

      expect(root.nodeState).toBe("verified-functional");
    });
  });

  describe("mid-run change survival (decision 5)", () => {
    it("an id marked unverified during a run stays unverified after reapplyRunChanges, then clears", () => {
      loadCatalog([functionalVerifier]);
      const root = buildRootNode("verified-all", { func: { proven: true } });
      const globalSettingsService = TestBed.inject(GlobalSettingsService);
      globalSettingsService.isVerifying = true;
      service.beginRun();
      service.markSubtreeUnverified(service.rootStatement!);

      const resultStatement = {
        id: root.id, isProven: true, nodeState: "verified-all", verifiers: {},
      } as unknown as IAbstractStatement;
      service.reapplyRunChanges([resultStatement]);

      expect(resultStatement.nodeState).toBe("unverified");
      expect(resultStatement.isProven).toBeFalse();

      // Cleared afterward: a later call with the same id is no longer affected.
      const untouched = {
        id: root.id, isProven: true, nodeState: "verified-all", verifiers: {},
      } as unknown as IAbstractStatement;
      service.reapplyRunChanges([untouched]);
      expect(untouched.nodeState).toBe("verified-all");
    });

    it("a setting changed during a run downgrades a verified-all result to settings-changed", () => {
      loadCatalog([functionalVerifier, mockVerifier(true)]);
      buildRootNode("verified-all", { func: { proven: true }, mock: { proven: true } });
      const globalSettingsService = TestBed.inject(GlobalSettingsService);
      globalSettingsService.isVerifying = true;
      service.beginRun();
      verifierService.updateSetting("mock", "threshold", "5");

      const resultStatement = {
        id: "x", isProven: true, nodeState: "verified-all", verifiers: {},
      } as unknown as IAbstractStatement;
      service.reapplyRunChanges([resultStatement]);

      expect(resultStatement.nodeState).toBe("settings-changed");
    });

    it("does not mark ids edited outside of a run", () => {
      loadCatalog([functionalVerifier]);
      const root = buildRootNode("verified-all", { func: { proven: true } });
      const globalSettingsService = TestBed.inject(GlobalSettingsService);
      globalSettingsService.isVerifying = false;
      service.beginRun();
      service.markSubtreeUnverified(service.rootStatement!);

      const resultStatement = {
        id: root.id, isProven: true, nodeState: "verified-all", verifiers: {},
      } as unknown as IAbstractStatement;
      service.reapplyRunChanges([resultStatement]);

      expect(resultStatement.nodeState).toBe("verified-all");
    });
  });

  describe("functionalOnly toggle recomputes node state live (Fix A)", () => {
    it("flips an already-rendered node between settings-changed and verified-functional without a new run, and back", () => {
      loadCatalog([functionalVerifier, mockVerifier(true)]);
      // In all-mode, a disabled entry for a currently-enabled id derives settings-changed
      // (row 5); the effect must recompute this from the toggle alone, no run involved.
      const root = buildRootNode("verified-all", {
        func: { proven: true },
        mock: { proven: false, disabled: true },
      });
      TestBed.tick();
      expect(root.nodeState).toBe("settings-changed");

      verifierService.setFunctionalOnly(true);
      TestBed.tick();
      expect(root.nodeState).toBe("verified-functional");

      verifierService.setFunctionalOnly(false);
      TestBed.tick();
      expect(root.nodeState).toBe("settings-changed");
    });

    it("does not throw when the toggle flips before any formula is loaded", () => {
      loadCatalog([functionalVerifier]);

      expect(() => {
        verifierService.setFunctionalOnly(true);
        TestBed.tick();
        verifierService.setFunctionalOnly(false);
        TestBed.tick();
      }).not.toThrow();
    });
  });

  describe("settings-dirty overlay survives disable/re-enable (Fix B regression)", () => {
    it("verified-all -> setting changed -> settings-changed -> disable -> verified-functional -> re-enable -> settings-changed (not verified-all)", () => {
      loadCatalog([functionalVerifier, mockVerifier(true)]);
      const root = buildRootNode("verified-all", {
        func: { proven: true },
        mock: { proven: true },
      });

      verifierService.updateSetting("mock", "threshold", "5");
      expect(root.nodeState).toBe("settings-changed");

      verifierService.setEnabled("mock", false);
      expect(root.nodeState).toBe("verified-functional");

      verifierService.setEnabled("mock", true);
      expect(root.nodeState).toBe("settings-changed");
    });

    it("a fresh result landing clears the dirty marker, so a later unrelated toggle no longer forces settings-changed", () => {
      loadCatalog([functionalVerifier, mockVerifier(true)]);
      const root = buildRootNode("verified-all", {
        func: { proven: true },
        mock: { proven: true },
      });

      verifierService.updateSetting("mock", "threshold", "5");
      expect(root.nodeState).toBe("settings-changed");

      // A fresh verify-all result lands for "mock"; reapplyRunChanges is what clears the
      // dirty marker (decision 5's "clear both markers afterward", extended to this set).
      root.verifiers = { func: { proven: true }, mock: { proven: true } };
      root.nodeState = "verified-all";
      service.reapplyRunChanges([root]);
      expect(root.nodeState).toBe("verified-all");

      // An unrelated toggle on the same Verifier no longer resurrects settings-changed.
      verifierService.setEnabled("mock", false);
      expect(root.nodeState).toBe("verified-functional");
      verifierService.setEnabled("mock", true);
      expect(root.nodeState).toBe("verified-all");
    });
  });
});
