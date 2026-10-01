import { useEffect } from 'react';
import { initAgent, } from './agent/agent';
import './App.css'
function App() {
  useEffect(() => {initAgent()}, []);
  return (
    <div>
      <h1>Welcome to Figr</h1>
      <iframe src="http://localhost:4001/page-1.html" width="1280" height="800"></iframe>

    </div>
  )
}

export default App
