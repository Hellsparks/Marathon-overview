import { useState, useEffect } from 'react';
import ProjectCard from '../components/projects/ProjectCard';
import CreateProjectModal from '../components/projects/CreateProjectModal';
import ProjectDetailView from '../components/projects/ProjectDetailView';
import { getFilaments } from '../api/spoolman';

export default function ProjectsPage() {
    const [projects, setProjects] = useState([]);
    const [filaments, setFilaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [projectsRes, filamentsData] = await Promise.all([
                fetch('/api/projects?status=active').then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to fetch projects'))),
                getFilaments().catch(() => [])
            ]);
            setProjects(projectsRes);
            setFilaments(filamentsData);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this project?')) return;
        try {
            const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete project');
            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    const closeModal = (wasSaved) => {
        setIsModalOpen(false);
        if (wasSaved) fetchData();
    };

    if (selectedProjectId) {
        return (
            <ProjectDetailView
                projectId={selectedProjectId}
                onBack={() => {
                    setSelectedProjectId(null);
                    fetchData();
                }}
                filaments={filaments}
            />
        );
    }

    return (
        <div className="page">
            <section className="page-section" style={{ paddingTop: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 className="section-title" style={{ margin: 0 }}>Active Projects</h2>
                    <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                        + New Project
                    </button>
                </div>

                {loading ? (
                    <div className="loading">Loading projects...</div>
                ) : error ? (
                    <div className="error">{error}</div>
                ) : projects.length === 0 ? (
                    <div className="empty-state">
                        <p>No active projects.</p>
                        <p style={{ fontSize: '13px', marginTop: '8px' }}>Create one from a template or by selecting G-code files.</p>
                    </div>
                ) : (
                    <div className="file-grid large">
                        {projects.map(p => (
                            <ProjectCard
                                key={p.id}
                                project={p}
                                onClick={() => setSelectedProjectId(p.id)}
                                onDelete={() => handleDelete(p.id)}
                            />
                        ))}
                    </div>
                )}
            </section>

            {isModalOpen && (
                <CreateProjectModal
                    onClose={() => closeModal(false)}
                    onSave={() => closeModal(true)}
                    filaments={filaments}
                />
            )}
        </div>
    );
}
