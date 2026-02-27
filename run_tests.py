import json
import requests
import sys

def run_tests():
    try:
        with open('test_requests.json', 'r') as f:
            test_cases = json.load(f)
    except Exception as e:
        print(f"Error reading test_requests.json: {e}")
        return

    api_url = "http://localhost:8080/api/analyze"
    results = []

    for case in test_cases:
        label = case.get('label', 'Unnamed test')
        payload = case.get('request', {})
        print(f"Running test: {label}...")
        
        try:
            response = requests.post(api_url, json=payload, timeout=60)
            status_code = response.status_code
            try:
                data = response.json()
            except:
                data = response.text

            results.append({
                "label": label,
                "status_code": status_code,
                "data": data
            })
            print(f"  Status: {status_code}")
        except Exception as e:
            print(f"  Error: {e}")
            results.append({
                "label": label,
                "status_code": 0,
                "error": str(e)
            })

    with open('test_results.json', 'w') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print("\nTests completed. Results saved to test_results.json.")

if __name__ == "__main__":
    run_tests()
