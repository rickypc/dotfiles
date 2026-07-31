# Bun Test Generator Evaluation Rubric

Verify canonical paths, typed Bun conversion, matrix quality, mocks, and coverage evidence.
For every imported module and global boundary used by the selected SUT, verify a
specific `mock()` or `mock.module()` plus an observable behavior assertion; the
selected SUT is the only real dependency.
