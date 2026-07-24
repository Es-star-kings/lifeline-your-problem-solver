import json
import os
import re
from typing import Any

import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn


ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://lifeline-your-problem-solver.vercel.app",
]

# Kaggle Gemma API configuration
KAGGLE_GEMMA_API_KEY = os.getenv("KAGGLE_GEMMA_API_KEY")
KAGGLE_GEMMA_API_ENDPOINT = os.getenv(
    "KAGGLE_GEMMA_API_ENDPOINT",
    "https://api.kaggle.com/v1/llm/generate",
)

# Check if API credentials are configured
API_CONFIGURED = bool(KAGGLE_GEMMA_API_KEY)
API_AVAILABLE = False
API_CHECK_MESSAGE: str | None = None

app = FastAPI(title="LIFELINE Gemma API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": "internal server error"})


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="User problem or context")
    system_prompt: str | None = Field(default="", description="Optional system instruction")
    temperature: float | None = Field(default=0.7, ge=0.0, le=2.0)
    max_new_tokens: int | None = Field(default=512, ge=32, le=2048)


class GenerateResponse(BaseModel):
    response: str


class ErrorResponse(BaseModel):
    detail: str


def check_api_credentials() -> None:
    """Validate that Kaggle Gemma API credentials are configured."""
    global API_AVAILABLE, API_CHECK_MESSAGE
    
    if not API_CONFIGURED:
        API_AVAILABLE = False
        API_CHECK_MESSAGE = "KAGGLE_GEMMA_API_KEY is not configured"
        return
    
    API_AVAILABLE = True
    API_CHECK_MESSAGE = None


def build_structured_schema() -> dict[str, Any]:
    return {
        "category": "education | healthcare | agriculture | productivity | community | general",
        "problemSummary": "A concise explanation of the user's actual problem",
        "userIntent": "What the user is trying to achieve",
        "urgency": "low | medium | high",
        "actionPlan": [
            {
                "id": "unique-id",
                "title": "Action step",
                "description": "What the user should do",
                "timeframe": "Optional timeframe",
                "status": "pending",
            }
        ],
        "suggestedTools": [
            {
                "id": "unique-id",
                "type": "notes | quiz | scenarios | explanation | study_plan | checklist | project_plan | resource_finder",
                "title": "Tool title",
                "description": "What this tool does",
            }
        ],
        "followUpQuestions": [],
        "resources": [],
    }


def build_fallback_payload(prompt: str) -> dict[str, Any]:
    return {
        "category": "general",
        "problemSummary": prompt.strip()[:240] or "The user described a situation that needs practical guidance.",
        "userIntent": "Understand the problem and identify the next helpful action.",
        "urgency": "medium",
        "actionPlan": [
            {
                "id": "fallback-step-1",
                "title": "Clarify the issue",
                "description": "Write down the specific problem and what you have already tried.",
                "timeframe": "Today",
                "status": "pending",
            }
        ],
        "suggestedTools": [],
        "followUpQuestions": ["What is the most important part of this problem to solve first?"],
        "resources": [],
    }


def extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        payload = json.loads(cleaned)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            payload = json.loads(match.group(0))
            if isinstance(payload, dict):
                return payload
        except json.JSONDecodeError:
            pass

    raise ValueError("model output was not valid JSON")


def generate_text_from_kaggle_api(
    prompt: str, system_prompt: str, temperature: float, max_new_tokens: int
) -> str:
    """Call the Kaggle Gemma API to generate structured analysis."""
    
    if not API_AVAILABLE:
        raise RuntimeError("Kaggle Gemma API is not available")
    
    final_prompt = (
        (system_prompt or "You are LIFELINE, a calm practical assistant.")
        + "\nReturn ONLY a single JSON object that matches the requested schema.\n\n"
        + f"Use this schema:\n{json.dumps(build_structured_schema(), indent=2)}\n\n"
        + f"Problem: {prompt}"
    )
    
    headers = {
        "Authorization": f"Bearer {KAGGLE_GEMMA_API_KEY}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "prompt": final_prompt,
        "temperature": temperature,
        "max_new_tokens": max_new_tokens,
    }
    
    try:
        response = requests.post(
            KAGGLE_GEMMA_API_ENDPOINT,
            json=payload,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        result = response.json()
        
        # Extract the generated text from the API response
        # The exact key depends on Kaggle's API response format
        generated_text = result.get("generated_text") or result.get("text") or str(result)
        return generated_text.strip()
    except requests.RequestException as exc:
        raise RuntimeError(f"Kaggle API request failed: {str(exc)}")
    except (KeyError, ValueError) as exc:
        raise RuntimeError(f"Failed to parse Kaggle API response: {str(exc)}")


@app.get("/health")
def health() -> dict[str, str | bool | None]:
    check_api_credentials()
    return {
        "status": "ok",
        "service": "LIFELINE Gemma API",
        "model": "Kaggle Gemma API",
        "api_available": API_AVAILABLE,
        "api_configured": API_CONFIGURED,
        "api_check_message": API_CHECK_MESSAGE,
    }


@app.post("/generate", response_model=GenerateResponse, responses={500: {"model": ErrorResponse}})
def generate(payload: GenerateRequest, request: Request) -> GenerateResponse:
    if not payload.prompt or not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")

    try:
        # Check API availability before attempting to generate
        check_api_credentials()
        
        if not API_AVAILABLE:
            # Use fallback if API is not available
            fallback_payload = build_fallback_payload(payload.prompt)
            return GenerateResponse(response=json.dumps(fallback_payload))
        
        raw_text = generate_text_from_kaggle_api(
            prompt=payload.prompt,
            system_prompt=payload.system_prompt or "",
            temperature=float(payload.temperature or 0.7),
            max_new_tokens=int(payload.max_new_tokens or 512),
        )
        parsed = extract_json_object(raw_text)
        return GenerateResponse(response=json.dumps(parsed))
    except Exception as exc:  # noqa: BLE001
        # Always fall back to structured response on any error
        fallback_payload = build_fallback_payload(payload.prompt)
        return GenerateResponse(response=json.dumps(fallback_payload))


if __name__ == "__main__":
    try:
        import asyncio

        if asyncio.get_event_loop().is_running():
            print("Event loop is already running; uvicorn startup skipped.")
        else:
            uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8080")), reload=False)
    except RuntimeError:
        print("Unable to start uvicorn because an event loop is already running.")
