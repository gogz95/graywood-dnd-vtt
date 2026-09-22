// ... existing code ...

<select bind:value={selectedSource} on:change={handleSourceChange}>
    <option value="">All Sources</option>
    {#each availableSources as src}
        <option value={src}>{src}</option>
    {/each}
</select>

// ... existing code ...