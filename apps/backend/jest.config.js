/** @type {import('jest').Config} */
module.exports = {
  "projects": [
    {
      "moduleFileExtensions": [
        "js",
        "json",
        "ts"
      ],
      "transform": {
        "^.+\\.ts$": [
          "ts-jest",
          {
            "tsconfig": "tsconfig.json"
            
          }
        ]
      },
      "testEnvironment": "node",
      "displayName": "unit",
      "rootDir": "src",
      "testRegex": ".*\\.spec\\.ts$"
    },
    {
      "moduleFileExtensions": [
        "js",
        "json",
        "ts"
      ],
      "transform": {
        "^.+\\.ts$": [
          "ts-jest",
          {
            "tsconfig": "tsconfig.json"
            
          }
        ]
      },
      "testEnvironment": "node",
      "displayName": "e2e",
      "rootDir": "test",
      "testRegex": ".*\\.e2e-spec\\.ts$",
      "setupFiles": [
        "<rootDir>/setup-env.ts"
      ],
      "globalSetup": "<rootDir>/global-setup.ts"
    }
  ]
};
