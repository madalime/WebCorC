package edu.kit.cbc.editor.verifier;

import io.micronaut.json.tree.JsonNode;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

/**
 * One Verifier a verification job calls, with its Settings resolved to one concrete value per
 * declared Setting — the Catalog default (Verifier Registry policy already applied) overlaid
 * with the project's persisted Verifier Override, by the same rules the frontend's
 * {@code applyOverrides} uses to show them: a locked toggle ({@code toggleable: false}) is
 * Catalog-owned, and an Override input counts only if it fits the Setting's kind.
 *
 * @param settings the resolved values in declaration order, keyed by Setting id
 */
public record ResolvedVerifier(String id, Map<String, JsonNode> settings) {

    private static final Logger LOGGER = Logger.getGlobal();

    public ResolvedVerifier {
        settings = Collections.unmodifiableMap(new LinkedHashMap<>(settings));
    }

    /**
     * The Verifiers {@code overrides} mark enabled in Catalog order, each resolved; never the
     * Functional Verifier, which is built in and runs first regardless.
     */
    public static List<ResolvedVerifier> enabled(VerifierCatalog catalog, Map<String, VerifierOverride> overrides) {
        return catalog.verifiers().stream()
            .filter(verifier -> !VerifierCatalogService.FUNCTIONAL_VERIFIER_ID.equals(verifier.id()))
            .filter(verifier -> isEnabled(verifier, overrides.get(verifier.id())))
            .map(verifier -> new ResolvedVerifier(verifier.id(), resolveSettings(verifier, overrides.get(verifier.id()))))
            .toList();
    }

    private static boolean isEnabled(Verifier verifier, VerifierOverride override) {
        if (Boolean.FALSE.equals(verifier.toggleable()) || override == null || override.enabled() == null) {
            return verifier.enabled();
        }
        return override.enabled();
    }

    private static Map<String, JsonNode> resolveSettings(Verifier verifier, VerifierOverride override) {
        Map<String, com.fasterxml.jackson.databind.JsonNode> inputs =
            override == null || override.settings() == null ? Map.of() : override.settings();
        Map<String, JsonNode> resolved = new LinkedHashMap<>();
        for (VerifierSetting setting : verifier.settings()) {
            resolved.put(setting.id(), resolve(verifier.id(), setting, inputs.get(setting.id())));
        }
        return resolved;
    }

    private static JsonNode resolve(String verifierId, VerifierSetting setting, com.fasterxml.jackson.databind.JsonNode input) {
        boolean bool = "boolean".equals(setting.type());
        if (input != null) {
            if (bool && input.isBoolean()) {
                return JsonNode.createBooleanNode(input.booleanValue());
            }
            if (!bool && input.isTextual() && isOption(setting, input.textValue())) {
                return JsonNode.createStringNode(input.textValue());
            }
            LOGGER.warning(String.format("Verifier Override for '%s' sets setting '%s' to %s, which does not fit it; "
                + "the Catalog default is used instead", verifierId, setting.id(), input));
        }
        if (setting.defaultValue() != null) {
            return setting.defaultValue();
        }
        return bool ? JsonNode.createBooleanNode(false) : JsonNode.createStringNode("");
    }

    /** Whether {@code value} is one of a select Setting's options; any string fits the other kinds. */
    private static boolean isOption(VerifierSetting setting, String value) {
        if (!"select".equals(setting.type()) || setting.options() == null) {
            return true;
        }
        return setting.options().stream().anyMatch(option -> value.equals(option.id()));
    }
}
