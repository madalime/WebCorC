package edu.kit.cbc.editor.verifier;

import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

/**
 * One Verifier a verification job calls, with every declared Setting already resolved to exactly
 * one concrete value -- never absent, never the raw Catalog/Override pair a caller would
 * otherwise have to reconcile itself. See {@link #enabled} for how that resolution is done.
 *
 * <p>{@code variableIds} plus, with {@code allowFunctionalVariables}, the program's own variables
 * are the scope this Verifier's Verifier Conditions may reference.
 *
 * @param settings the resolved values in declaration order, keyed by Setting id
 * @param settingsUpdatedAt the Override's settings stamp, or {@code null} when it has none
 */
public record ResolvedVerifier(String id, Map<String, JsonNode> settings, Long settingsUpdatedAt,
        List<String> variableIds, boolean allowFunctionalVariables) {

    private static final Logger LOGGER = Logger.getGlobal();

    public ResolvedVerifier {
        settings = Collections.unmodifiableMap(new LinkedHashMap<>(settings));
        variableIds = variableIds == null ? List.of() : List.copyOf(variableIds);
    }

    public ResolvedVerifier(String id, Map<String, JsonNode> settings, Long settingsUpdatedAt) {
        this(id, settings, settingsUpdatedAt, List.of(), false);
    }

    /**
     * The Verifiers {@code overrides} mark enabled in Catalog order, each resolved; never the
     * Functional Verifier, which is built in and runs first regardless.
     */
    public static List<ResolvedVerifier> enabled(VerifierCatalog catalog, Map<String, VerifierOverride> overrides) {
        return catalog.verifiers().stream()
            .filter(verifier -> !VerifierCatalogService.FUNCTIONAL_VERIFIER_ID.equals(verifier.id()))
            .filter(verifier -> isEnabled(verifier, overrides.get(verifier.id())))
            .map(verifier -> of(verifier, overrides.get(verifier.id())))
            .toList();
    }

    private static ResolvedVerifier of(Verifier verifier, VerifierOverride override) {
        return new ResolvedVerifier(verifier.id(), resolveSettings(verifier, override),
            override == null ? null : override.settingsUpdatedAt(),
            variableIds(verifier), Boolean.TRUE.equals(verifier.allowFunctionalVariables()));
    }

    /** A Variable without a string {@code id} is skipped; the Self-Description validator rejects it anyway. */
    private static List<String> variableIds(Verifier verifier) {
        List<String> ids = new ArrayList<>();
        for (JsonNode variable : verifier.variables()) {
            JsonNode id = variable.get("id");
            if (id != null && id.isString()) {
                ids.add(id.getStringValue());
            }
        }
        return ids;
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
