package edu.kit.cbc.editor.verifier;

import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Enforces on a parsed {@link SelfDescription} the constraints of the Self-Description schema
 * ({@code openapi/schema/verifiers/selfDescription.yml} and {@code settings/*}) that the
 * deserializer cannot: the four known setting kinds and nothing else, defaults where the schema
 * demands them, unique setting ids, and {@code allowFunctionalVariables} only next to declared
 * variables. A Self-Description that fails is <em>invalid</em> — the Verifier answered, but not
 * with something the Catalog can serve — and is reported as one
 * {@link InvalidSelfDescriptionException} listing every violation, so an operator sees all of
 * them at once rather than one per restart.
 *
 * <p>Rules, each with its own reason in the message:
 * <ul>
 *   <li>{@code label} is present and not blank;</li>
 *   <li>every setting has an {@code id} and a {@code label};</li>
 *   <li>a setting's {@code type}/{@code valueType} is one of text/string (valueType may be
 *       omitted), text/number, select or boolean — select and boolean carry no
 *       {@code valueType};</li>
 *   <li>{@code required: true} implies a {@code default};</li>
 *   <li>a select setting declares at least one option;</li>
 *   <li>a boolean setting declares a boolean {@code default};</li>
 *   <li>a text or select setting's {@code default}, when present, is a string;</li>
 *   <li>setting ids are unique;</li>
 *   <li>{@code allowFunctionalVariables: true} only together with non-empty {@code variables}.</li>
 * </ul>
 */
public final class SelfDescriptionValidator {

    private SelfDescriptionValidator() {}

    /**
     * Validates a Self-Description.
     *
     * @param id the Registry id of the Verifier that sent it, for the message
     * @param description the parsed Self-Description
     * @throws InvalidSelfDescriptionException listing every violated rule
     */
    public static void validate(String id, SelfDescription description) throws InvalidSelfDescriptionException {
        List<String> violations = violations(description);
        if (!violations.isEmpty()) {
            throw new InvalidSelfDescriptionException(
                "Self-Description of Verifier '" + id + "' is invalid: " + String.join("; ", violations), null);
        }
    }

    /** Every rule the Self-Description violates, in declaration order; empty when it is valid. */
    private static List<String> violations(SelfDescription description) {
        List<String> violations = new ArrayList<>();
        if (description.label() == null || description.label().isBlank()) {
            violations.add("label is missing");
        }
        Set<String> settingIds = new HashSet<>();
        List<VerifierSetting> settings = description.settings() == null ? List.of() : description.settings();
        for (int i = 0; i < settings.size(); i++) {
            VerifierSetting setting = settings.get(i);
            if (setting.id() == null || setting.id().isBlank()) {
                violations.add("setting #" + (i + 1) + " has no id");
                continue;
            }
            if (!settingIds.add(setting.id())) {
                violations.add("setting id '" + setting.id() + "' is declared more than once");
            }
            violations.addAll(settingViolations(setting));
        }
        boolean hasVariables = description.variables() != null && !description.variables().isEmpty();
        if (Boolean.TRUE.equals(description.allowFunctionalVariables()) && !hasVariables) {
            violations.add("allowFunctionalVariables is set but no variables are declared");
        }
        return violations;
    }

    private static List<String> settingViolations(VerifierSetting setting) {
        List<String> violations = new ArrayList<>();
        String name = "setting '" + setting.id() + "'";
        if (setting.label() == null || setting.label().isBlank()) {
            violations.add(name + " has no label");
        }
        SettingKind kind = SettingKind.of(setting);
        if (kind == SettingKind.UNKNOWN) {
            violations.add(name + " has an unsupported type/valueType combination: "
                + setting.type() + "/" + setting.valueType());
            return violations;
        }
        JsonNode defaultValue = setting.defaultValue();
        if (Boolean.TRUE.equals(setting.required()) && defaultValue == null) {
            violations.add(name + " is required but declares no default");
        }
        if (kind == SettingKind.SELECT && (setting.options() == null || setting.options().isEmpty())) {
            violations.add("select " + name + " declares no options");
        }
        if (kind == SettingKind.BOOLEAN) {
            if (defaultValue == null || !defaultValue.isBoolean()) {
                violations.add("boolean " + name + " declares no boolean default");
            }
        } else if (defaultValue != null && !defaultValue.isString()) {
            violations.add(name + " declares a default that is not a string");
        }
        return violations;
    }

    /**
     * The four kinds of settings the schema knows, discriminated by {@code type}/{@code valueType},
     * plus {@link #UNKNOWN} for any other combination.
     */
    private enum SettingKind {
        TEXT_STRING, TEXT_NUMBER, SELECT, BOOLEAN, UNKNOWN;

        static SettingKind of(VerifierSetting setting) {
            String type = setting.type();
            String valueType = setting.valueType();
            if ("text".equals(type)) {
                if (valueType == null || "string".equals(valueType)) {
                    return TEXT_STRING;
                }
                return "number".equals(valueType) ? TEXT_NUMBER : UNKNOWN;
            }
            if (valueType != null) {
                return UNKNOWN;
            }
            if ("select".equals(type)) {
                return SELECT;
            }
            return "boolean".equals(type) ? BOOLEAN : UNKNOWN;
        }
    }
}
