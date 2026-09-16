package edu.kit.cbc.editor.verifier;

import io.micronaut.context.annotation.EachProperty;
import io.micronaut.context.annotation.Parameter;
import io.micronaut.core.order.Ordered;

/**
 * One entry of the Verifier Registry: a Verifier the deployment declares by {@code id} and
 * {@code url}, bound from the ordered list under {@code verifiers} in the backend
 * configuration (the deployment's Registry file, mounted via {@code MICRONAUT_CONFIG_FILES}).
 *
 * <p>The list index is the entry's {@linkplain #getOrder() order}, so the Registry presents
 * Verifiers in the order the operator listed them. The Registry policy fields (label, enabled,
 * toggleable, setting defaults) are not bound yet.
 */
@EachProperty(value = "verifiers", list = true)
public class VerifierRegistryEntry implements Ordered {

    private final int index;
    private String id;
    private String url;

    public VerifierRegistryEntry(@Parameter Integer index) {
        this.index = index;
    }

    @Override
    public int getOrder() {
        return index;
    }

    /** Stable identifier the backend addresses the Verifier by; assigned here, not by the Verifier. */
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    /** Base URL of the Verifier; the Verifier API paths are appended to it. */
    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }
}
