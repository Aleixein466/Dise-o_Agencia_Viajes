// Conventional Commits (requirements §22).
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Bodies carry review notes and attribution lines; keep them readable but not rejected for length.
    "body-max-line-length": [1, "always", 120],
    "footer-max-line-length": [1, "always", 120],
  },
};
