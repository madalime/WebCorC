package edu.kit.cbc.editor.verifier;

import io.micronaut.context.env.MapPropertySource;
import io.micronaut.context.env.PropertySourcePropertyResolver;
import io.micronaut.context.env.yaml.YamlPropertySourceLoader;
import io.micronaut.core.type.Argument;
import io.micronaut.json.tree.JsonNode;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

class VerifierRegistryTest {

    private static VerifierRegistryEntry entry(int index, String id, String url) {
        VerifierRegistryEntry entry = new VerifierRegistryEntry(index);
        entry.setId(id);
        entry.setUrl(url);
        return entry;
    }

    /** A raw configuration source for entry #0, as {@code VerifierRegistry} would see it bound. */
    private static PropertySourcePropertyResolver rawEntry0(Map<String, Object> properties) {
        Map<String, Object> prefixed = properties.entrySet().stream()
            .collect(Collectors.toMap(e -> "verifiers[0]." + e.getKey(), Map.Entry::getValue));
        PropertySourcePropertyResolver resolver = new PropertySourcePropertyResolver();
        resolver.addPropertySource(MapPropertySource.of("test", prefixed));
        return resolver;
    }

    @Test
    void entriesAreOrderedByConfigurationIndexRegardlessOfInjectionOrder() {
        VerifierRegistry registry = new VerifierRegistry(List.of(
            entry(1, "sec", "http://sec"),
            entry(0, "eebc", "http://eebc")));

        Assertions.assertEquals(List.of("eebc", "sec"),
            registry.entries().stream().map(VerifierRegistryEntry::getId).toList());
    }

    @Test
    void idsFollowConfigurationOrder() {
        VerifierRegistry registry = new VerifierRegistry(List.of(
            entry(1, "sec", "http://sec"),
            entry(0, "eebc", "http://eebc")));

        Assertions.assertEquals(List.of("eebc", "sec"), registry.ids());
    }

    @Test
    void answersTheEntryForAnId() {
        VerifierRegistry registry = new VerifierRegistry(List.of(
            entry(0, "eebc", "http://eebc"),
            entry(1, "sec", "http://sec")));

        Assertions.assertEquals("http://sec", registry.entry("sec").orElseThrow().getUrl());
        Assertions.assertTrue(registry.entry("unknown").isEmpty());
    }

    @Test
    void rejectsDuplicateIds() {
        IllegalStateException e = Assertions.assertThrows(IllegalStateException.class,
            () -> new VerifierRegistry(List.of(entry(0, "eebc", "http://a"), entry(1, "eebc", "http://b"))));

        Assertions.assertTrue(e.getMessage().contains("eebc"), e.getMessage());
    }

    @Test
    void rejectsEntriesWithoutIdOrUrl() {
        Assertions.assertThrows(IllegalStateException.class,
            () -> new VerifierRegistry(List.of(entry(0, null, "http://a"))));
        Assertions.assertThrows(IllegalStateException.class,
            () -> new VerifierRegistry(List.of(entry(0, "eebc", " "))));
    }

    @Test
    void reservesTheFunctionalVerifierId() {
        Assertions.assertThrows(IllegalStateException.class,
            () -> new VerifierRegistry(List.of(entry(0, "func", "http://a"))));
    }

    // --- Policy fields and the unknown-field check -----------------------------------------

    @Test
    void acceptsTheDocumentedPolicyFieldNames() {
        VerifierRegistryEntry entry = entry(0, "eebc", "http://eebc");
        var properties = rawEntry0(Map.of(
            "id", "eebc",
            "url", "http://eebc",
            "label", "Energy Efficiency",
            "enabled", "true",
            "toggleable", "false",
            "settings.threshold.default", "50"
        ));

        VerifierRegistry registry = new VerifierRegistry(List.of(entry), properties);

        Assertions.assertEquals(List.of("eebc"), registry.ids(), "Binding succeeds; no field is rejected");
    }

    @Test
    void rejectsAnUnknownTopLevelField() {
        VerifierRegistryEntry entry = entry(0, "eebc", "http://eebc");
        var properties = rawEntry0(Map.of("id", "eebc", "url", "http://eebc", "lable", "typo"));

        IllegalStateException e = Assertions.assertThrows(IllegalStateException.class,
            () -> new VerifierRegistry(List.of(entry), properties));

        Assertions.assertTrue(e.getMessage().contains("eebc") && e.getMessage().contains("lable"), e.getMessage());
    }

    @Test
    void rejectsAPerSettingFieldOtherThanDefault() {
        VerifierRegistryEntry entry = entry(0, "eebc", "http://eebc");
        var properties = rawEntry0(Map.of(
            "id", "eebc", "url", "http://eebc", "settings.threshold.label", "Custom label"));

        IllegalStateException e = Assertions.assertThrows(IllegalStateException.class,
            () -> new VerifierRegistry(List.of(entry), properties));

        Assertions.assertTrue(e.getMessage().contains("settings.threshold.label"), e.getMessage());
    }

    // --- Setting-default policy values keep their YAML scalar type -----------------------

    /**
     * The {@code settings} map of entry #0 as the {@code VerifierRegistryEntry.setSettings}
     * binding receives it: the Registry YAML read by Micronaut's own loader and resolved as the
     * setter's {@code Map<String, Map<String, Object>>}.
     */
    private static Map<String, Map<String, Object>> boundSettings(String yaml) throws IOException {
        Map<String, Object> flattened = new YamlPropertySourceLoader()
            .read("verifiers.yml", new ByteArrayInputStream(yaml.getBytes(StandardCharsets.UTF_8)));
        PropertySourcePropertyResolver resolver = new PropertySourcePropertyResolver();
        resolver.addPropertySource(MapPropertySource.of("verifiers.yml", flattened));
        return resolver.getProperty("verifiers[0].settings",
                Argument.mapOf(Argument.STRING, Argument.mapOf(String.class, Object.class)))
            .orElseThrow(() -> new AssertionError("No settings bound from " + flattened));
    }

    @Test
    void settingDefaultKeepsTheYamlScalarType() throws IOException {
        VerifierRegistryEntry entry = entry(0, "eebc", "http://eebc");
        entry.setSettings(boundSettings("""
            verifiers:
              - id: eebc
                url: http://eebc
                settings:
                  unquoted:
                    default: 75
                  quoted:
                    default: "75"
                  toggle:
                    default: true
            """));

        Assertions.assertEquals(JsonNode.createNumberNode(75), entry.settingDefault("unquoted").orElseThrow(),
            "An unquoted YAML number binds as a number, which a text setting's string default rule rejects");
        Assertions.assertEquals(JsonNode.createStringNode("75"), entry.settingDefault("quoted").orElseThrow());
        Assertions.assertEquals(JsonNode.createBooleanNode(true), entry.settingDefault("toggle").orElseThrow());
        Assertions.assertTrue(entry.settingDefault("absent").isEmpty());
    }

    @Test
    void theConvenienceConstructorSkipsTheUnknownFieldCheck() {
        // Entries built directly in Java (as every other test in this file does) never went
        // through property binding, so there is nothing to check them against.
        VerifierRegistry registry = new VerifierRegistry(List.of(entry(0, "eebc", "http://eebc")));

        Assertions.assertEquals(List.of("eebc"), registry.ids());
    }
}
