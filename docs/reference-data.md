# Reference data

ShelfOps MVP has exactly one **Simulated ShelfOps Organization** outside production. Stores contain sectors and locations; a location cannot cross a store boundary. Names are trimmed and nonblank. Deactivated records remain historical but are unavailable for new selection.

The seeded catalog has seven categories. All require a location and creation evidence; all except `equipment-failure` and `other` require a product, and `other` also requires a reporter note. Severities are ordered `low`, `medium`, `high`, `critical`.

`fixtureVocabulary` uses fixed IDs and clock values for two stores, two sectors and locations per store, ten products, every role, inactive references, and bounded single- and multi-store central scopes. It is test/demo vocabulary, never production operational data.
