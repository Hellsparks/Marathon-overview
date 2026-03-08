import { useState, useCallback, useEffect } from 'react';

export function useFolders(type = 'gcode', baseMovePath = '/api/files') {
    const [folders, setFolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchFolders = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`/api/folders?type=${type}`);
            if (!res.ok) throw new Error('Failed to fetch folders');
            const data = await res.json();
            setFolders(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFolders();
    }, [fetchFolders]);

    const createFolder = async (name, parentId = null) => {
        const res = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parent_id: parentId, type }),
        });
        if (!res.ok) throw new Error('Failed to create folder');
        await fetchFolders();
    };

    const renameFolder = async (id, name) => {
        const res = await fetch(`/api/folders/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error('Failed to rename folder');
        await fetchFolders();
    };

    const deleteFolder = async (id) => {
        const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete folder');
        await fetchFolders();
    };

    const moveFile = async (fileId, folderId) => {
        const res = await fetch(`${baseMovePath}/${fileId}/folder`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_id: folderId }),
        });
        if (!res.ok) throw new Error('Failed to move item');
    };

    const moveFolder = async (folderIdToMove, destinationFolderId) => {
        const res = await fetch(`/api/folders/${folderIdToMove}/parent`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_id: destinationFolderId }),
        });
        if (!res.ok) throw new Error('Failed to move folder');
        await fetchFolders();
    };

    return { folders, loading, error, refresh: fetchFolders, createFolder, renameFolder, deleteFolder, moveFile, moveFolder };
}
