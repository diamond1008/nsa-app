package aiworkflows

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	defaultOpenRouterURL = "https://openrouter.ai/api/v1/chat/completions"
	defaultOpenRouterKey = ""
	defaultGeminiURL     = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
	defaultGeminiKey     = ""
)

var defaultModelOrder = []string{
	"nvidia/nemotron-3-ultra-550b-a55b:free",
	"openrouter/free",
	"nvidia/nemotron-3.5-lightning:free",
	"google/gemma-4-31b-it:free",
}

// LLMClient interacts with Gemini and OpenRouter API with cascading fallback.
type LLMClient struct {
	geminiKey  string
	geminiURL  string
	apiKey     string
	baseURL    string
	httpClient *http.Client
	models     []string
}

func NewLLMClient() *LLMClient {
	key := os.Getenv("OPENROUTER_API_KEY")
	if strings.TrimSpace(key) == "" {
		key = defaultOpenRouterKey
	}

	baseURL := os.Getenv("OPENROUTER_BASE_URL")
	if strings.TrimSpace(baseURL) == "" {
		baseURL = defaultOpenRouterURL
	}

	geminiKey := os.Getenv("GEMINI_API_KEY")
	if strings.TrimSpace(geminiKey) == "" {
		geminiKey = defaultGeminiKey
	}

	models := defaultModelOrder
	if customModel := os.Getenv("OPENROUTER_MODEL"); strings.TrimSpace(customModel) != "" {
		models = append([]string{strings.TrimSpace(customModel)}, defaultModelOrder...)
	}

	return &LLMClient{
		geminiKey: geminiKey,
		geminiURL: defaultGeminiURL,
		apiKey:    key,
		baseURL:   baseURL,
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
		models: models,
	}
}

type OpenRouterMessage struct {
	Role       string               `json:"role"`
	Content    *string              `json:"content"`
	ToolCallID string               `json:"tool_call_id,omitempty"`
	ToolCalls  []OpenRouterToolCall `json:"tool_calls,omitempty"`
}

type OpenRouterToolCall struct {
	ID           string                 `json:"id"`
	Type         string                 `json:"type"`
	Function     OpenRouterFunctionCall `json:"function"`
	ExtraContent any                    `json:"extra_content,omitempty"`
}

type OpenRouterFunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type OpenRouterTool struct {
	Type     string             `json:"type"`
	Function OpenRouterFunction `json:"function"`
}

type OpenRouterFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type OpenRouterRequest struct {
	Model      string              `json:"model"`
	Messages   []OpenRouterMessage `json:"messages"`
	Tools      []OpenRouterTool    `json:"tools,omitempty"`
	ToolChoice any                 `json:"tool_choice,omitempty"`
	MaxTokens  int                 `json:"max_tokens,omitempty"`
}

type OpenRouterResponse struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Choices []struct {
		Index        int    `json:"index"`
		FinishReason string `json:"finish_reason"`
		Message      struct {
			Role      string               `json:"role"`
			Content   *string              `json:"content"`
			Reasoning *string              `json:"reasoning,omitempty"`
			ToolCalls []OpenRouterToolCall `json:"tool_calls,omitempty"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Code    any    `json:"code"`
	} `json:"error,omitempty"`
}

// CompleteWithFallback attempts chat completion across Gemini and OpenRouter models.
func (c *LLMClient) CompleteWithFallback(ctx context.Context, messages []OpenRouterMessage, tools []OpenRouterTool) (*OpenRouterResponse, error) {
	var lastErr error

	// 1. Try Gemini first if key is configured
	if strings.TrimSpace(c.geminiKey) != "" {
		geminiModels := []string{"gemini-flash-lite-latest", "gemini-flash-latest"}
		for _, gModel := range geminiModels {
			reqPayload := OpenRouterRequest{
				Model:     gModel,
				Messages:  messages,
				Tools:     tools,
				MaxTokens: 1200,
			}
			if len(tools) > 0 {
				reqPayload.ToolChoice = "auto"
			}

			resp, err := c.sendGeminiRequest(ctx, reqPayload)
			if err == nil && resp != nil && len(resp.Choices) > 0 {
				return resp, nil
			}
			if err != nil {
				lastErr = fmt.Errorf("gemini %s failed: %w", gModel, err)
			}
		}
	}

	// 2. Try OpenRouter fallback models
	for _, model := range c.models {
		reqPayload := OpenRouterRequest{
			Model:     model,
			Messages:  messages,
			Tools:     tools,
			MaxTokens: 1200,
		}
		if len(tools) > 0 {
			reqPayload.ToolChoice = "auto"
		}

		resp, err := c.sendRequest(ctx, reqPayload)
		if err == nil && resp != nil && len(resp.Choices) > 0 {
			return resp, nil
		}
		if err != nil {
			lastErr = fmt.Errorf("model %s failed: %w", model, err)
		} else if resp != nil && resp.Error != nil {
			lastErr = fmt.Errorf("model %s error: %s", model, resp.Error.Message)
		}
	}

	if lastErr != nil {
		return nil, lastErr
	}
	return nil, errors.New("all LLM models failed to respond")
}

func (c *LLMClient) sendGeminiRequest(ctx context.Context, reqPayload OpenRouterRequest) (*OpenRouterResponse, error) {
	bodyBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.geminiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Authorization", "Bearer "+c.geminiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	httpResp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer httpResp.Body.Close()

	respBytes, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, err
	}

	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		return nil, fmt.Errorf("Gemini HTTP %d: %s", httpResp.StatusCode, string(respBytes))
	}

	var result OpenRouterResponse
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("unmarshal Gemini response: %w", err)
	}

	return &result, nil
}

func (c *LLMClient) sendRequest(ctx context.Context, reqPayload OpenRouterRequest) (*OpenRouterResponse, error) {
	bodyBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("HTTP-Referer", "http://localhost:5173")
	httpReq.Header.Set("X-Title", "NSA Training Platform")

	httpResp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer httpResp.Body.Close()

	respBytes, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, err
	}

	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		var errObj OpenRouterResponse
		if jsonErr := json.Unmarshal(respBytes, &errObj); jsonErr == nil && errObj.Error != nil {
			return nil, fmt.Errorf("HTTP %d: %s", httpResp.StatusCode, errObj.Error.Message)
		}
		return nil, fmt.Errorf("HTTP %d: %s", httpResp.StatusCode, string(respBytes))
	}

	var result OpenRouterResponse
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	return &result, nil
}
