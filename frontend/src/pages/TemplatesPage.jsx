import { useState, useEffect } from 'react';
import TemplateCard from '../components/templates/TemplateCard';
import CreateTemplateModal from '../components/templates/CreateTemplateModal';
import TemplatePreviewModal from '../components/templates/TemplatePreviewModal';
import { getFilaments } from '../api/spoolman';

export default function TemplatesPage() {
    const [templates, setTemplates] = useState([]);
    const [filaments, setFilaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [previewTemplate, setPreviewTemplate] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [templatesRes, filamentsData] = await Promise.all([
                fetch('/api/templates').then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to fetch templates'))),
                getFilaments().catch(() => []) // fail gracefully if Spoolman is down
            ]);
            setTemplates(templatesRes);
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

    const handleEdit = (template) => {
        setEditingTemplate(template);
        setIsModalOpen(true);
    };

    const handleDelete = async (templateId) => {
        if (!confirm('Are you sure you want to delete this template? All copied plate files will be removed.')) return;
        try {
            const res = await fetch(`/api/templates/${templateId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete template');
            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    const openNewModal = () => {
        setEditingTemplate(null);
        setIsModalOpen(true);
    };

    const closeModal = (wasSaved) => {
        setIsModalOpen(false);
        setEditingTemplate(null);
        if (wasSaved) fetchData();
    };

    return (
        <div className="page">
            <section className="page-section" style={{ paddingTop: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 className="section-title" style={{ margin: 0 }}>Project Templates</h2>
                    <button className="btn btn-primary" onClick={openNewModal}>
                        + New Template
                    </button>
                </div>

                {loading ? (
                    <div className="loading">Loading templates...</div>
                ) : error ? (
                    <div className="error">{error}</div>
                ) : templates.length === 0 ? (
                    <p className="empty-state">No templates found. Create one to get started.</p>
                ) : (
                    <div className="file-grid large">
                        {templates.map(t => (
                            <TemplateCard
                                key={t.id}
                                template={t}
                                filaments={filaments}
                                onEdit={() => handleEdit(t)}
                                onDelete={() => handleDelete(t.id)}
                                onClick={() => setPreviewTemplate(t)}
                            />
                        ))}
                    </div>
                )}
            </section>

            {isModalOpen && (
                <CreateTemplateModal
                    onClose={() => closeModal(false)}
                    onSave={() => closeModal(true)}
                    existingTemplate={editingTemplate}
                    filaments={filaments}
                />
            )}

            {previewTemplate && (
                <TemplatePreviewModal
                    template={previewTemplate}
                    filaments={filaments}
                    onClose={() => setPreviewTemplate(null)}
                    onEdit={() => handleEdit(previewTemplate)}
                />
            )}
        </div>
    );
}
