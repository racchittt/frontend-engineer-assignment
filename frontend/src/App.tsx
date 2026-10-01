import { useEffect, useState, useRef } from 'react';
import { initAgent, getIframeError, watchIframe, onErrorChange, retryIframe } from './agent/agent';

interface Screen {
  id: string;
  name: string;
  url: string;
}

function App() {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewErrors, setPreviewErrors] = useState<Map<string, string | null>>(new Map());
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('http://localhost:4000/screens');
        const data = await res.json();
        setScreens(data);
        console.log(`Loaded ${data.length} screens`);
      } catch (err) {
        console.error('Failed to load screens:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Initialize agent listener immediately
  useEffect(() => {
    const cleanup = initAgent();

    // Agent tells us when an error changes, no polling
    const unsubscribe = onErrorChange(() => {
      const newErrors = new Map<string, string | null>();
      iframeRefs.current.forEach((iframe, screenId) => {
        newErrors.set(screenId, getIframeError(iframe));
      });
      setPreviewErrors(newErrors);
    });

    return () => {
      cleanup?.();
      unsubscribe();
    };
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <div className="w-full bg-[#fdfcfa] min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8">Design Tool Viewer</h1>
      <div className="grid grid-cols-2 gap-6">
        {screens.map((screen) => {
          const error = previewErrors.get(screen.id);

          return (
            <div key={screen.id} className="flex flex-col">
              <h3 className="text-lg font-semibold mb-2">{screen.name}</h3>
              <div className="relative">
                <iframe
                  ref={(el) => {
                    if (el) {
                      iframeRefs.current.set(screen.id, el);
                      watchIframe(el);
                    }
                  }}
                  src={screen.url}
                  width="1280"
                  height="800"
                  className="border border-gray-300 rounded"
                />
                {error && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded">
                    <div className="bg-white p-6 rounded-lg text-center">
                      <p className="text-red-600 font-semibold mb-4">{error}</p>
                      <button
                        onClick={() => {
                          const el = iframeRefs.current.get(screen.id);
                          if (el) retryIframe(el);
                        }}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;
