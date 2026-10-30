"""Per-execution observations; never touches jobs, credits, or database state."""
import contextvars
import os
import time
from dataclasses import dataclass, field

CURRENT = contextvars.ContextVar('examflow_inference_metrics', default=None)


def inference_batch_size(value=None):
    raw = os.getenv('AI_INFERENCE_BATCH_SIZE', '1') if value is None else value
    if str(raw) not in ('1', '3'):
        raise ValueError('AI_INFERENCE_BATCH_SIZE must be 1 or 3')
    return int(raw)


@dataclass
class RunMetrics:
    configuration: dict = field(default_factory=dict)
    inferences: list = field(default_factory=list)
    questions: list = field(default_factory=list)
    resources: list = field(default_factory=list)
    retrieval_manifests: list = field(default_factory=list)
    retrieval_seconds: float = 0.0
    duplicate_seconds: float = 0.0
    retries: int = 0
    malformed_responses: int = 0
    regeneration_requests: int = 0
    requested_questions: int | None = None

    def question(self, candidate, reason, call_id, normalized=None):
        self.questions.append({'candidate': candidate, 'normalized': normalized,
                               'decision': reason, 'callId': call_id})

    def export(self):
        return dict(configuration=self.configuration, inferences=self.inferences,
                    questions=self.questions, resources=self.resources,
                    retrievalManifests=self.retrieval_manifests,
                    retrievalSeconds=self.retrieval_seconds,
                    duplicateSeconds=self.duplicate_seconds, retries=self.retries,
                    malformedResponses=self.malformed_responses, regenerationRequests=self.regeneration_requests)


async def measured_generate(client, url, model, prompt, options):
    """Keep caller-specified sampling intact; preserve all raw Ollama timings."""
    metrics = CURRENT.get()
    if metrics is not None:
        metrics.configuration.update(modelName=model,
            temperature=options.get('temperature'),seed=options.get('seed'),
            num_ctx=options.get('num_ctx'),num_predict=options.get('num_predict'))
        if 'modelDigestLookedUp' not in metrics.configuration:
            metrics.configuration['modelDigestLookedUp']=True
            try:
                tags=await client.get(url.rstrip('/')+'/api/tags')
                tags.raise_for_status()
                match=next((m for m in tags.json().get('models',[]) if m.get('name') in (model,model+':latest')),None)
                metrics.configuration['modelDigest']=match.get('digest') if match else None
            except Exception:
                metrics.configuration['modelDigest']=None
            try:
                loaded=await client.get(url.rstrip('/')+'/api/ps')
                loaded.raise_for_status()
                names={item.get('name') for item in loaded.json().get('models',[])}
                metrics.configuration['startCondition']='warm' if model in names or model+':latest' in names else 'cold'
            except Exception:
                metrics.configuration['startCondition']='unknown'
    started = time.perf_counter()
    event = {'callId': len(metrics.inferences)+1 if metrics else None,
             'requestedQuestions':metrics.requested_questions if metrics else None,
             'options': dict(options), 'rawResponse': None}
    try:
        response = await client.post(url.rstrip('/')+'/api/generate', json={
            'model': model, 'prompt': prompt, 'stream': False, 'format': 'json',
            'options': dict(options)})
        response.raise_for_status()
        data = response.json()
        event.update({k: data.get(k) for k in ('total_duration','load_duration',
            'prompt_eval_duration','eval_duration','prompt_eval_count','eval_count','done_reason')})
        event['rawResponse'] = data.get('response', '')
        return data.get('response', '')
    except Exception as exc:
        event['error'] = type(exc).__name__
        raise
    finally:
        event['wallSeconds'] = time.perf_counter()-started
        if metrics is not None:
            metrics.inferences.append(event)
