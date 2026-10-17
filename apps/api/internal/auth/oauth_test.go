package auth

import (
	"encoding/base64"
	"encoding/json"
	"testing"
)

func createFakeJWT(payload map[string]interface{}) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payloadBytes, _ := json.Marshal(payload)
	payloadSegment := base64.RawURLEncoding.EncodeToString(payloadBytes)
	signature := base64.RawURLEncoding.EncodeToString([]byte("signature"))
	return header + "." + payloadSegment + "." + signature
}

func TestExtractEmailFromIDToken(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		claims   map[string]interface{}
		rawToken string
		expected string
	}{
		{
			name: "email claim present",
			claims: map[string]interface{}{
				"email": "user@microsoft.com",
			},
			expected: "user@microsoft.com",
		},
		{
			name: "preferred_username claim present",
			claims: map[string]interface{}{
				"preferred_username": "john.doe@company.onmicrosoft.com",
			},
			expected: "john.doe@company.onmicrosoft.com",
		},
		{
			name: "upn claim present",
			claims: map[string]interface{}{
				"upn": "student@nsa.local",
			},
			expected: "student@nsa.local",
		},
		{
			name: "unique_name claim present",
			claims: map[string]interface{}{
				"unique_name": "teacher@nsa.local",
			},
			expected: "teacher@nsa.local",
		},
		{
			name: "prefers email claim over preferred_username",
			claims: map[string]interface{}{
				"email":              "primary@nsa.local",
				"preferred_username": "secondary@nsa.local",
			},
			expected: "primary@nsa.local",
		},
		{
			name:     "empty id token returns empty",
			rawToken: "",
			expected: "",
		},
		{
			name:     "malformed token returns empty",
			rawToken: "not.a.valid.jwt",
			expected: "",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			token := tc.rawToken
			if token == "" && tc.claims != nil {
				token = createFakeJWT(tc.claims)
			}
			got := extractEmailFromIDToken(token)
			if got != tc.expected {
				t.Fatalf("expected %q, got %q", tc.expected, got)
			}
		})
	}
}
